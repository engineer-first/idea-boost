import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "../contracts/access";
import worker from "./api-worker";
import {
  createRoomAs,
  initializeTestRoom,
  runInRoomDO,
  sessionCookieFor,
} from "./test-helpers";

const owner = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Owner",
  email: "owner@test.invalid",
};
let cookie: string;
beforeAll(async () => {
  cookie = await sessionCookieFor(owner);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users(id,email,name) VALUES(?,?,?)",
  )
    .bind(owner.sub, owner.email, owner.name)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
  )
    .bind(owner.sub, PERMISSIONS.readSharedOutcomes)
    .run();
});
const configured = () => env;
function request(path = "", authenticated = true, method = "GET") {
  return new Request(`https://api.test/api/shared-outcomes${path}`, {
    method,
    headers: authenticated ? { Cookie: cookie } : {},
  });
}
describe("共有成果のセッション認可", () => {
  it("未認証を拒否し、閲覧者の更新操作を禁止する", async () => {
    expect((await worker.fetch(request("", false), env)).status).toBe(401);
    expect(
      (await worker.fetch(request("", true, "POST"), configured())).status,
    ).toBe(405);
  });
  it("閲覧権限のあるセッションは一覧を取得できる", async () => {
    const response = await worker.fetch(request(), configured());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ outcomes: [], nextCursor: null });
  });
  it("名前のないルームも作成時から保存し、削除後も保持する", async () => {
    const room = await createRoomAs(owner);
    const response = await worker.fetch(
      request(`/${room.roomId}`),
      configured(),
    );
    expect(response.status).toBe(200);
    const record = (await response.json()) as {
      roomId: string;
      displayId: string;
      name: string | null;
      snapshot: unknown;
    };
    expect(record.roomId).toBe(room.roomId);
    expect(record.displayId).not.toBe(room.inviteCode);
    expect(record.name).toBe(null);
    await runInRoomDO(room.roomId, async (instance) => instance.disband());
    expect(
      (await worker.fetch(request(`/${room.roomId}`), configured())).status,
    ).toBe(200);
  });
});

describe("保全・再試行・期限", () => {
  it("共有盤面は匿名化し、個人用へ戻した付箋を次の記録から除く", async () => {
    const room = await createRoomAs(owner);
    await runInRoomDO(room.roomId, async (instance, state) => {
      const sql = state.storage.sql;
      for (const [id, visibility, content] of [
        ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "shared", "公開案"],
        ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "private", "非公開メモ"],
      ])
        sql.exec(
          "INSERT INTO notes(id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES(?,?,?,10,20,'2026-09-27','2026-09-27',?,1)",
          id,
          owner.sub,
          content,
          visibility,
        );
      await (
        instance as unknown as { preserveSharedOutcome(): Promise<void> }
      ).preserveSharedOutcome();
      await instance.alarm();
      const record = await instance.getSharedOutcome();
      expect(record?.snapshot?.notes.map((n) => n.content)).toEqual(["公開案"]);
      expect(JSON.stringify(record)).not.toContain(owner.sub);
      expect(JSON.stringify(record)).not.toContain("votedByMe");
      sql.exec("UPDATE notes SET visibility='private'");
      await (
        instance as unknown as { preserveSharedOutcome(): Promise<void> }
      ).preserveSharedOutcome();
      await instance.alarm();
      expect((await instance.getSharedOutcome())?.snapshot?.notes).toEqual([]);
    });
  });
  it("外部保存が失敗しても完了内容を保持し、解散後の再試行で同じ記録を反映する", async () => {
    const room = await createRoomAs(owner);
    await runInRoomDO(room.roomId, async (instance, state) => {
      const subject = instance as unknown as {
        preserveSharedOutcome(confirmed?: boolean): Promise<void>;
        writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
      };
      const original = subject.writeSharedOutcomeProjection.bind(subject);
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','確定案',?,'2026-09-27')",
        owner.sub,
      );
      await subject.preserveSharedOutcome(true);
      subject.writeSharedOutcomeProjection = async () => {
        throw new Error("storage unavailable");
      };
      await instance.alarm();
      const failed = await instance.getSharedOutcome();
      expect(failed?.saveStatus).toBe("failed");
      expect(failed?.snapshot?.decisions).toEqual([]);
      expect(failed?.lastSavedAt).not.toBe(null);
      state.storage.sql.exec("UPDATE decisions SET note_content='後の編集'");
      await subject.preserveSharedOutcome();
      await instance.disband();
      subject.writeSharedOutcomeProjection = original;
      await instance.alarm();
      const recovered = await instance.getSharedOutcome();
      expect(recovered?.saveStatus).toBe("saved");
      expect(recovered?.status).toBe("confirmed");
      expect(recovered?.snapshot?.decisions[0].content).toBe("確定案");
    });
  });
  it("保存処理中の新しい保全を消さず、送信した版だけを成功にする", async () => {
    const room = await createRoomAs(owner);
    await runInRoomDO(room.roomId, async (instance, state) => {
      const subject = instance as unknown as {
        preserveSharedOutcome(confirmed?: boolean): Promise<void>;
        writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
      };
      const original = subject.writeSharedOutcomeProjection.bind(subject);
      await subject.preserveSharedOutcome();
      subject.writeSharedOutcomeProjection = async (snapshot) => {
        await original(snapshot);
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','次の確定案',?,'2026-09-27')",
          owner.sub,
        );
        await subject.preserveSharedOutcome(true);
      };
      await instance.alarm();
      const pending = await instance.getSharedOutcome();
      expect(pending?.snapshot?.decisions).toEqual([]);
      expect(pending?.saveStatus).toBe("pending");
      subject.writeSharedOutcomeProjection = original;
      await instance.alarm();
      expect(
        (await instance.getSharedOutcome())?.snapshot?.decisions[0].content,
      ).toBe("次の確定案");
    });
  });
  it("30日期限の閲覧停止と削除は再試行・一覧閲覧で延長されない", async () => {
    const room = await createRoomAs(owner);
    await runInRoomDO(room.roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE shared_outcome_state SET expires_at = ?, last_used_at = ?",
        Date.now() - 1,
        Date.now() - 31 * 86400000,
      );
      expect(await instance.getSharedOutcome()).toBe(null);
      expect(
        state.storage.sql
          .exec("SELECT saved_json,pending_json FROM shared_outcome_state")
          .one(),
      ).toMatchObject({ saved_json: null, pending_json: null });
      await instance.ensureSharedOutcome(room.roomId);
      expect(await instance.getSharedOutcome()).toBe(null);
    });
    expect(
      await env.DB.prepare(
        "SELECT room_id FROM shared_outcomes WHERE room_id = ?",
      )
        .bind(room.roomId)
        .first(),
    ).toBe(null);
    expect(
      (await worker.fetch(request(`/${room.roomId}`), configured())).status,
    ).toBe(404);
  });
});

it("ルーム作成と同時に本文なしの索引を作り、初回保存失敗・解散でも一覧から失わない", async () => {
  const { ensureUser, insertRoom, deleteRoom } = await import("./lib/db");
  await ensureUser(env.DB, {
    id: owner.sub,
    email: owner.email,
    name: owner.name,
  });
  const room = await insertRoom(env.DB, owner.sub);
  expect(
    await env.DB.prepare(
      "SELECT snapshot_json FROM shared_outcomes WHERE room_id = ?",
    )
      .bind(room.roomId)
      .first(),
  ).toEqual({ snapshot_json: null });
  await runInRoomDO(room.roomId, async (instance) => {
    const subject = instance as unknown as {
      writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
    };
    subject.writeSharedOutcomeProjection = async () => {
      throw new Error("first projection failed");
    };
    await initializeTestRoom(instance, owner.sub, owner.name, {
      roomId: room.roomId,
    });
    await instance.disband();
  });
  await deleteRoom(env.DB, room.roomId);
  const result = (await (
    await worker.fetch(request(), configured())
  ).json()) as {
    outcomes: Array<{
      roomId: string;
      lastSavedAt: number | null;
      saveStatus: string;
    }>;
  };
  expect(result.outcomes).toContainEqual(
    expect.objectContaining({
      roomId: room.roomId,
      lastSavedAt: null,
      saveStatus: "failed",
    }),
  );
});

it("完了保全の失敗は成功通知せず、投影だけの失敗では参加者も成果へ進める", async () => {
  const { connectRoomAs, joinRoomAs } = await import("./test-helpers");
  const room = await createRoomAs(owner);
  const member = {
    sub: "22222222-2222-4222-8222-222222222222",
    name: "Member",
    email: "member@test.invalid",
  };
  await joinRoomAs(member, room.inviteCode);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, owner.sub);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','持ち帰る確定案',?,'2026-09-27')",
      owner.sub,
    );
  });
  await runInRoomDO(room.roomId, (_instance, state) => {
    for (const phase of [1, 2])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        owner.sub,
        new Date().toISOString(),
      );
  });
  const hostSocket = await connectRoomAs(owner, room.roomId);
  const memberSocket = await connectRoomAs(member, room.roomId);
  await hostSocket.next();
  await memberSocket.next();
  await runInRoomDO(room.roomId, (instance) => {
    const subject = instance as unknown as {
      preserveSharedOutcome(): Promise<void>;
    };
    subject.preserveSharedOutcome = async () => {
      throw new Error("durability failed");
    };
  });
  hostSocket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await hostSocket.next()).toMatchObject({ type: "error" });
  await runInRoomDO(room.roomId, (instance, state) => {
    expect(
      state.storage.sql.exec("SELECT outcome_published FROM room_state").one()
        .outcome_published,
    ).toBe(0);
    const subject = instance as unknown as {
      preserveSharedOutcome?: () => Promise<void>;
      writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
    };
    delete subject.preserveSharedOutcome;
    subject.writeSharedOutcomeProjection = async () => {
      throw new Error("projection unavailable");
    };
  });
  hostSocket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await hostSocket.next()).toEqual({
    type: "outcome:published",
    published: true,
  });
  expect(await memberSocket.next()).toEqual({
    type: "outcome:published",
    published: true,
  });
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    expect((await instance.getSharedOutcome())?.saveStatus).toBe("failed");
    const pending = state.storage.sql
      .exec("SELECT pending_json FROM shared_outcome_state")
      .one().pending_json as string;
    expect(
      JSON.parse(pending).decisions.find(
        (d: { phase: number }) => d.phase === 3,
      ).content,
    ).toBe("持ち帰る確定案");
  });
  hostSocket.close();
  memberSocket.close();
});

it("共有操作のない個人入力や成果閲覧は保持期限を延ばさない", async () => {
  const { connectRoomAs } = await import("./test-helpers");
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, (instance) =>
    instance.setPhase({ kind: "step", phase: 1, step: 1 }, owner.sub),
  );
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  const before = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  socket.ws.send(
    JSON.stringify({
      type: "note:create",
      content: "個人用",
      visibility: "private",
      x: 10,
      y: 10,
    }),
  );
  const result = await socket.next();
  expect(result.type).toBe("note:inserted");
  await worker.fetch(request(), configured());
  const after = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  expect(after?.lastUsedAt).toBe(before?.lastUsedAt);
  expect(after?.expiresAt).toBe(before?.expiresAt);
  socket.close();
});

it("投影中に期限を跨いだ本文も直ちに削除し、削除後は再予約しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const subject = instance as unknown as {
      preserveSharedOutcome(): Promise<void>;
      writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
    };
    await subject.preserveSharedOutcome();
    const original = subject.writeSharedOutcomeProjection.bind(subject);
    subject.writeSharedOutcomeProjection = async (snapshot) => {
      await original(snapshot);
      state.storage.sql.exec(
        "UPDATE shared_outcome_state SET expires_at = ? WHERE id = 1",
        Date.now() - 1,
      );
    };
    await instance.alarm();
    expect(
      state.storage.sql
        .exec("SELECT saved_json FROM shared_outcome_state")
        .one().saved_json,
    ).toBeNull();
    expect(await state.storage.getAlarm()).toBeNull();
    await instance.alarm();
    expect(
      state.storage.sql
        .exec("SELECT saved_json,pending_json FROM shared_outcome_state")
        .one(),
    ).toMatchObject({ saved_json: null, pending_json: null });
    expect(await state.storage.getAlarm()).toBeNull();
  });
  expect(
    await env.DB.prepare(
      "SELECT room_id FROM shared_outcomes WHERE room_id = ?",
    )
      .bind(room.roomId)
      .first(),
  ).toBeNull();
});

it("期限後の削除失敗は閲覧停止を維持し、再試行間隔を守って削除を完了する", async () => {
  const room = await createRoomAs(owner);
  await env.DB.prepare("DROP TABLE shared_outcomes").run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET expires_at = ? WHERE id = 1",
      Date.now() - 1,
    );
    await instance.alarm();
    const row = state.storage.sql
      .exec("SELECT saved_json,retry_at FROM shared_outcome_state")
      .one();
    expect(row.saved_json).not.toBeNull();
    expect(row.retry_at).toBeGreaterThan(Date.now() + 50000);
    expect(await state.storage.getAlarm()).toBe(row.retry_at);
    expect(await instance.getSharedOutcome()).toBeNull();
  });
  await env.DB.prepare(
    "CREATE TABLE shared_outcomes(room_id TEXT PRIMARY KEY,last_used_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,snapshot_json TEXT,creation_visibility TEXT NOT NULL DEFAULT 'hidden')",
  ).run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    expect(await instance.getSharedOutcome()).toBeNull();
    expect(
      state.storage.sql
        .exec(
          "SELECT saved_json,pending_json,retry_at FROM shared_outcome_state",
        )
        .one(),
    ).toMatchObject({ saved_json: null, pending_json: null, retry_at: null });
    expect(await state.storage.getAlarm()).toBeNull();
  });
});

it("受理した共有タイマー操作だけ最終利用を更新し、保存盤面と保存時刻を変えない", async () => {
  const { connectRoomAs, joinRoomAs } = await import("./test-helpers");
  const room = await createRoomAs(owner);
  const member = {
    sub: "22222222-2222-4222-8222-222222222222",
    name: "Member",
    email: "member@test.invalid",
  };
  await joinRoomAs(member, room.inviteCode);
  const old = Date.now() - 3600000;
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 1, step: 1 }, owner.sub);
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET last_used_at = ? WHERE id = 1",
      old,
    );
  });
  const host = await connectRoomAs(owner, room.roomId);
  await host.next();
  const guest = await connectRoomAs(member, room.roomId);
  await guest.next();
  const before = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  guest.ws.send(JSON.stringify({ type: "timer:start", durationMs: 60000 }));
  expect(await guest.next()).toMatchObject({ type: "error" });
  expect(
    (await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()))
      ?.lastUsedAt,
  ).toBe(old);
  host.ws.send(JSON.stringify({ type: "timer:start", durationMs: 60000 }));
  expect(await host.next()).toMatchObject({
    type: "timer:updated",
    timer: { status: "running" },
  });
  const after = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  expect(after?.lastUsedAt).toBeGreaterThan(old);
  expect(after?.expiresAt).toBe((after?.lastUsedAt ?? 0) + 30 * 86400000);
  expect(after?.snapshot).toEqual(before?.snapshot);
  expect(after?.lastSavedAt).toBe(before?.lastSavedAt);
  host.ws.send(JSON.stringify({ type: "timer:start", durationMs: 60000 }));
  expect(await host.next()).toMatchObject({ type: "error" });
  expect(
    (await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()))
      ?.lastUsedAt,
  ).toBe(after?.lastUsedAt);
  host.close();
  guest.close();
});

it("共有開始と交代の受理で最終利用を更新し、古い版の再送では延長しない", async () => {
  const { connectRoomAs } = await import("./test-helpers");
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, (instance) =>
    instance.setPhase({ kind: "step", phase: 1, step: 2 }, owner.sub),
  );
  const socket = await connectRoomAs(owner, room.roomId);
  const snapshot = await socket.next();
  if (snapshot.type !== "snapshot" || !snapshot.sharing)
    throw new Error("共有状態がありません");
  const old = Date.now() - 3600000;
  await runInRoomDO(room.roomId, (_instance, state) => {
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET last_used_at=?",
      old,
    );
  });
  socket.ws.send(
    JSON.stringify({
      type: "sharing:start",
      revision: snapshot.sharing.revision,
      durationMs: 60000,
    }),
  );
  const started = await socket.next();
  expect(started).toMatchObject({
    type: "sharing:updated",
    sharing: { status: "active" },
  });
  const first = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  expect(first?.lastUsedAt).toBeGreaterThan(old);
  socket.ws.send(
    JSON.stringify({
      type: "sharing:start",
      revision: snapshot.sharing.revision,
      durationMs: 60000,
    }),
  );
  expect(await socket.next()).toMatchObject({ type: "sharing:updated" });
  expect(
    (await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()))
      ?.lastUsedAt,
  ).toBe(first?.lastUsedAt);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const row = state.storage.sql
      .exec("SELECT state_json FROM sharing_state WHERE id=1")
      .one();
    const sharing = JSON.parse(row.state_json as string);
    sharing.startsAt = Date.now() - 1;
    state.storage.sql.exec(
      "UPDATE sharing_state SET state_json=? WHERE id=1",
      JSON.stringify(sharing),
    );
    await instance.alarm();
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET last_used_at=?",
      old,
    );
  });
  const active = await socket.next();
  if (active.type !== "sharing:updated")
    throw new Error("共有開始通知がありません");
  socket.ws.send(
    JSON.stringify({
      type: "sharing:advance",
      revision: active.sharing.revision,
      outcome: "done",
    }),
  );
  expect(await socket.next()).toMatchObject({
    type: "sharing:updated",
    sharing: { status: "complete" },
  });
  expect(
    (await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()))
      ?.lastUsedAt,
  ).toBeGreaterThan(old);
  socket.close();
});

it.each([
  "disconnect",
  null,
  { x: 70, y: 80 },
])("ドラッグ途中は成果を保存せず、終了時に最終位置を保存する (%j)", async (position) => {
  const { connectRoomAs } = await import("./test-helpers");
  const room = await createRoomAs(owner);
  const noteId = crypto.randomUUID();
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 1, step: 2 }, owner.sub);
    state.storage.sql.exec(
      "INSERT INTO notes(id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES(?,?,?,10,20,'2026-09-27','2026-09-27','shared',1)",
      noteId,
      owner.sub,
      "移動する案",
    );
    await (
      instance as unknown as { preserveSharedOutcome(): Promise<void> }
    ).preserveSharedOutcome();
    await instance.alarm();
  });
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  const before = await runInRoomDO(room.roomId, (instance) =>
    instance.getSharedOutcome(),
  );
  const dragId = crypto.randomUUID();
  try {
    socket.ws.send(JSON.stringify({ type: "note:drag:start", noteId, dragId }));
    expect(await socket.next()).toMatchObject({
      type: "note:drag:result",
      accepted: true,
    });
    socket.ws.send(
      JSON.stringify({ type: "note:drag:move", noteId, dragId, x: 70, y: 80 }),
    );
    expect(await socket.next()).toMatchObject({ type: "note:updated" });
    await runInRoomDO(room.roomId, async (instance) => {
      await instance.alarm();
    });
    expect(
      await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()),
    ).toEqual(before);
    if (position === "disconnect") {
      socket.close();
      await vi.waitFor(async () => {
        const latest = await runInRoomDO(room.roomId, (instance) =>
          instance.getSharedOutcome(),
        );
        expect(latest?.lastUsedAt).toBeGreaterThan(before?.lastUsedAt ?? 0);
      });
      await runInRoomDO(room.roomId, async (instance) => {
        await instance.alarm();
      });
      expect(
        (
          await runInRoomDO(room.roomId, (instance) =>
            instance.getSharedOutcome(),
          )
        )?.snapshot?.notes,
      ).toContainEqual(expect.objectContaining({ id: noteId, x: 70, y: 80 }));
      return;
    }
    socket.ws.send(
      JSON.stringify({ type: "note:drag:end", noteId, dragId, position }),
    );
    expect(await socket.next()).toMatchObject({ type: "note:updated" });
    await runInRoomDO(room.roomId, async (instance) => {
      await instance.alarm();
    });
    const after = await runInRoomDO(room.roomId, (instance) =>
      instance.getSharedOutcome(),
    );
    expect(after?.snapshot?.notes).toContainEqual(
      expect.objectContaining({ id: noteId, x: 70, y: 80 }),
    );
    expect(after?.lastUsedAt).toBeGreaterThan(before?.lastUsedAt ?? 0);
    // 同じ終了の再送は保存・期限更新を行わない。
    socket.ws.send(
      JSON.stringify({
        type: "note:drag:end",
        noteId,
        dragId,
        position: { x: 99, y: 99 },
      }),
    );
    socket.ws.send(JSON.stringify({ type: "note:drag:start", noteId, dragId }));
    expect(await socket.next()).toMatchObject({
      type: "note:drag:result",
      accepted: false,
    });
    expect(
      await runInRoomDO(room.roomId, (instance) => instance.getSharedOutcome()),
    ).toEqual(after);
  } finally {
    socket.close();
  }
});
