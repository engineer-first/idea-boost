import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker from "./api-worker";
import {
  connectRoomAs,
  createRoomAs,
  initializeTestRoom,
  joinRoomAs,
  runInRoomDO,
  sessionCookieFor,
} from "./test-helpers";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.invalid",
};
const guest = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "Guest",
  email: "guest@test.invalid",
};
const outsider = {
  sub: "33333333-3333-4333-8333-333333333333",
  name: "Other",
  email: "other@test.invalid",
};
async function request(
  path: string,
  user = host,
  method = "GET",
  body?: unknown,
) {
  return worker.fetch(
    new Request(`https://api.test/api/${path}`, {
      method,
      headers: {
        Cookie: await sessionCookieFor(user),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}
async function complete(prepare?: Parameters<typeof runInRoomDO>[1]) {
  const room = await createRoomAs(host);
  await joinRoomAs(guest, room.inviteCode);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    for (const phase of [1, 2, 3])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        host.sub,
        new Date().toISOString(),
      );
  });
  if (prepare) await runInRoomDO(room.roomId, prepare);
  const socket = await connectRoomAs(host, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  return { ...room, socket };
}
describe("本人向けの完了ルーム再訪", () => {
  it("未認証は401、非閲覧者・不存在は同じ404、本人だけ3件と固定5場面を取得する", async () => {
    const room = await complete();
    expect(
      (
        await worker.fetch(
          new Request("https://api.test/api/completed-rooms"),
          env,
        )
      ).status,
    ).toBe(401);
    const response = await request(`completed-rooms/${room.roomId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const result = (await response.json()) as {
      decisions: unknown[];
      scenes: unknown[];
      completedAt: number;
      expiresAt: number;
    };
    expect(result.decisions).toHaveLength(3);
    expect(result.scenes).toHaveLength(5);
    expect(result.expiresAt - result.completedAt).toBe(30 * 86400000);
    expect(JSON.stringify(result)).not.toMatch(
      /votes|authorId|subjective|objective|Host|Guest/,
    );
    const denied = await request(`completed-rooms/${room.roomId}`, outsider);
    const missing = await request(
      `completed-rooms/${crypto.randomUUID()}`,
      outsider,
    );
    expect(denied.status).toBe(404);
    expect(await denied.text()).toBe(await missing.text());
    room.socket.close();
  });
  it("完了後の参加・作業更新・解散を拒否し、ホスト本人の退出で閲覧権を失わない", async () => {
    const room = await complete();
    expect(
      (await request("rooms/join", outsider, "POST", { code: room.inviteCode }))
        .status,
    ).toBe(409);
    room.socket.ws.send(
      JSON.stringify({ type: "timer:start", durationMs: 60000 }),
    );
    expect(await room.socket.next()).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(
      (await request(`rooms/${room.roomId}/leave`, host, "POST")).status,
    ).toBe(409);
    expect(
      (
        await request(`rooms/${room.roomId}/leave`, host, "POST", {
          intent: "self",
        })
      ).status,
    ).toBe(204);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM rooms WHERE id=?")
        .bind(room.roomId)
        .first(),
    ).not.toBeNull();
    room.socket.close();
  });
  it("再送で完了日時・権利・期限を更新せず、期限ちょうどから拒否して元盤面も削除する", async () => {
    const room = await complete();
    const before = await (
      await request(`completed-rooms/${room.roomId}`)
    ).json();
    room.socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
    expect(await room.socket.next()).toMatchObject({
      type: "outcome:published",
    });
    expect(
      await (await request(`completed-rooms/${room.roomId}`)).json(),
    ).toEqual(before);
    await runInRoomDO(room.roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE completed_room SET expires_at=?",
        Date.now(),
      );
      state.storage.sql.exec(
        "UPDATE shared_outcome_state SET expires_at=?",
        Date.now(),
      );
      await instance.alarm();
      expect(
        state.storage.sql.exec("SELECT * FROM members").toArray(),
      ).toHaveLength(0);
      for (const socket of state.getWebSockets())
        expect(socket.deserializeAttachment()).toBeNull();
    });
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
    expect(
      (await request("rooms/join", outsider, "POST", { code: room.inviteCode }))
        .status,
    ).not.toBe(200);
    room.socket.close();
  });
});

it("保全だけ済んだ旧データを公開成立と見なさず、旧公開済みへ新しい閲覧権を捏造しない", async () => {
  const room = await createRoomAs(host);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,'保全案',?,'2026-09-29')",
      crypto.randomUUID(),
      host.sub,
    );
    for (const phase of [1, 2])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        host.sub,
        new Date().toISOString(),
      );
    await (
      instance as unknown as {
        preserveSharedOutcome(confirmed: boolean): Promise<void>;
      }
    ).preserveSharedOutcome(true);
    state.storage.sql.exec("UPDATE room_state SET outcome_published=0");
  });
  const socket = await connectRoomAs(host, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(200);
  socket.close();
  const legacy = await createRoomAs(host);
  await runInRoomDO(legacy.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,'旧公開',?,'2026-09-29')",
      crypto.randomUUID(),
      host.sub,
    );
    state.storage.sql.exec("UPDATE room_state SET outcome_published=1");
  });
  const old = await connectRoomAs(host, legacy.roomId);
  await old.next();
  old.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await old.next()).toMatchObject({ type: "outcome:published" });
  expect((await request(`completed-rooms/${legacy.roomId}`)).status).toBe(404);
  old.close();
});

it("同時刻でも最後の通常前進だけを固定し、戻る直前・再投票・現在の盤面で代用しない", async () => {
  const { recordProgressTransition } = await import("./room/progress-history");
  const { captureSharedOutcome } = await import("./room/shared-outcomes");
  const room = await complete(async (instance, state) => {
    const sql = state.storage.sql;
    const now = Date.now();
    const noteId = crypto.randomUUID();
    sql.exec(
      "INSERT INTO notes(id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES(?,?,?,10,20,'2026-09-29','2026-09-29','shared',1)",
      noteId,
      host.sub,
      "最初の整理",
    );
    const transition = (
      phase: number,
      step: number,
      nextPhase: number,
      nextStep: number,
      action: "next" | "restart-writing" | "revote",
    ) => {
      const current = {
        kind: "step" as const,
        phase: phase as 1 | 2 | 3,
        step: step as 1 | 2 | 3 | 4 | 5,
      };
      // 最終化直前盤面の捕捉は本番の#375記録関数を使う。
      sql.exec("DELETE FROM progress_history WHERE exited_at IS NULL");
      recordProgressTransition(
        sql,
        current,
        {
          kind: "step",
          phase: nextPhase as 1 | 2 | 3,
          step: nextStep as 1 | 2 | 3 | 4 | 5,
        },
        action,
        now,
        () => captureSharedOutcome(sql, now),
      );
    };
    transition(1, 3, 1, 4, "next");
    sql.exec("UPDATE notes SET content='最後に前進した整理',x=55");
    transition(1, 3, 1, 4, "next");
    sql.exec("UPDATE notes SET content='戻る直前の盤面',x=99");
    transition(1, 3, 1, 1, "restart-writing");
    transition(1, 5, 1, 4, "revote");
    transition(1, 5, 2, 1, "next");
    transition(2, 4, 3, 1, "next");
    transition(3, 3, 3, 4, "next");
    sql.exec("UPDATE notes SET content='完了時の現在盤面'");
    sql.exec("DELETE FROM progress_history WHERE exited_at IS NULL");
    await instance.alarm();
  });
  const response = await request(
    `completed-rooms/${room.roomId}/scenes/problem-grouping`,
  );
  const result = (await response.json()) as {
    board: {
      notes: Array<{ content: string; x: number }>;
      decisions: unknown[];
    };
    scene: { status: string };
  };
  expect(result.scene.status).toBe("saved");
  expect(result.board.notes).toEqual([
    expect.objectContaining({ content: "最後に前進した整理", x: 55 }),
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /votes|subjective|objective|authorId|rank/,
  );
  expect(JSON.stringify(result)).not.toContain("完了時の現在盤面");
  expect(
    (
      await request(
        `completed-rooms/${room.roomId}/scenes/${crypto.randomUUID()}`,
      )
    ).status,
  ).toBe(404);
  room.socket.close();
});

it("途中の保全失敗・導入前・正常な空盤面を区別し、反映失敗の再試行でも元時刻を保つ", async () => {
  const { recordProgressTransition } = await import("./room/progress-history");
  const room = await complete(async (instance, state) => {
    const sql = state.storage.sql;
    recordProgressTransition(
      sql,
      { kind: "step", phase: 1, step: 3 },
      { kind: "step", phase: 1, step: 4 },
      "next",
      Date.now(),
      () => {
        throw new Error("capture failed");
      },
    );
    sql.exec("DELETE FROM progress_history WHERE exited_at IS NULL");
    recordProgressTransition(
      sql,
      { kind: "step", phase: 3, step: 3 },
      { kind: "step", phase: 3, step: 4 },
      "next",
    );
    sql.exec("DELETE FROM progress_history WHERE exited_at IS NULL");
    const subject = instance as unknown as {
      writeProgressHistoryProjection(
        id: string,
        snapshot: string,
        expiry: number,
      ): Promise<void>;
    };
    subject.writeProgressHistoryProjection = async () => {
      throw new Error("external unavailable");
    };
  });
  await runInRoomDO(room.roomId, (instance) => instance.alarm());
  const detail = (await (
    await request(`completed-rooms/${room.roomId}`)
  ).json()) as {
    scenes: Array<{ kind: string; recordedAt: number | null; status: string }>;
  };
  expect(detail.scenes).toContainEqual({
    kind: "problem-grouping",
    recordedAt: expect.any(Number),
    status: "missing",
  });
  expect(detail.scenes).toContainEqual({
    kind: "problem-decision",
    recordedAt: null,
    status: "before-recording",
  });
  const failed = detail.scenes.find((s) => s.kind === "idea-mapping");
  expect(failed?.status).toBe("failed");
  await runInRoomDO(room.roomId, async (instance) => {
    delete (instance as unknown as { writeProgressHistoryProjection?: unknown })
      .writeProgressHistoryProjection;
    await instance.alarm();
  });
  const board = (await (
    await request(`completed-rooms/${room.roomId}/scenes/idea-mapping`)
  ).json()) as { scene: unknown; board: { notes: unknown[] } };
  expect(board.scene).toEqual({ ...failed, status: "saved" });
  expect(board.board.notes).toEqual([]);
  room.socket.close();
});

it("在籍中の切断者は含め、完了前退出者は除き、完了後本人退出者の閲覧権は維持する", async () => {
  const room = await complete(async (instance) => {
    await instance.upsertMember(outsider.sub, outsider.name);
    await instance.leave(outsider.sub);
  });
  expect((await request(`completed-rooms/${room.roomId}`, guest)).status).toBe(
    200,
  );
  expect(
    (await request(`completed-rooms/${room.roomId}`, outsider)).status,
  ).toBe(404);
  expect(
    (await request(`rooms/${room.roomId}/leave`, guest, "POST")).status,
  ).toBe(204);
  expect((await request(`completed-rooms/${room.roomId}`, guest)).status).toBe(
    200,
  );
  room.socket.close();
});

it("必須記録の保存失敗は全体をrollbackし、再試行で完了が一度だけ成立する", async () => {
  const room = await createRoomAs(host);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,'確定案',?,'2026-09-29')",
      crypto.randomUUID(),
      host.sub,
    );
    for (const phase of [1, 2])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        host.sub,
        new Date().toISOString(),
      );
    state.storage.sql.exec(
      "CREATE TRIGGER fail_completion BEFORE INSERT ON completed_room BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    );
  });
  const socket = await connectRoomAs(host, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "error" });
  await runInRoomDO(room.roomId, (_instance, state) => {
    expect(
      state.storage.sql.exec("SELECT outcome_published FROM room_state").one()
        .outcome_published,
    ).toBe(0);
    expect(
      state.storage.sql.exec("SELECT * FROM completed_room").toArray(),
    ).toHaveLength(0);
    expect(
      state.storage.sql
        .exec("SELECT * FROM progress_history WHERE action='complete'")
        .toArray(),
    ).toHaveLength(0);
    state.storage.sql.exec("DROP TRIGGER fail_completion");
  });
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  await runInRoomDO(room.roomId, (_instance, state) => {
    expect(
      state.storage.sql
        .exec("SELECT * FROM progress_history WHERE action='complete'")
        .toArray(),
    ).toHaveLength(1);
  });
  socket.close();
});

it("一覧索引は外部障害後にアラームから再試行し、本人の結果だけを返す", async () => {
  const room = await complete();
  await env.DB.prepare("DROP TABLE completed_room_viewers").run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    expect(
      state.storage.sql.exec("SELECT retry_at FROM completed_room").one()
        .retry_at,
    ).toBeGreaterThan(Date.now());
    expect(await state.storage.getAlarm()).not.toBeNull();
  });
  expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(200);
  await env.DB.prepare(
    "CREATE TABLE completed_room_viewers(user_id TEXT NOT NULL,room_id TEXT NOT NULL,completed_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(user_id,room_id))",
  ).run();
  await runInRoomDO(room.roomId, (instance) => instance.alarm());
  const list = (await (await request("completed-rooms")).json()) as {
    rooms: Array<{ roomId: string }>;
  };
  expect(list.rooms.map((r) => r.roomId)).toContain(room.roomId);
  expect(await (await request("completed-rooms", outsider)).json()).toEqual({
    rooms: [],
    nextCursor: null,
  });
  room.socket.close();
});

it("削除失敗中も期限拒否を保ち、再試行で属性・本文・索引を消して再初期化しない", async () => {
  const room = await complete();
  await runInRoomDO(room.roomId, (instance) => instance.alarm());
  await env.DB.prepare("DROP TABLE completed_room_viewers").run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    const time = Date.now();
    state.storage.sql.exec("UPDATE completed_room SET expires_at=?", time);
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET expires_at=?",
      time,
    );
    await instance.alarm();
    expect(
      state.storage.sql
        .exec("SELECT deleted,retry_at FROM completed_room")
        .one(),
    ).toMatchObject({ deleted: 0, retry_at: expect.any(Number) });
    expect(await instance.getCompletedRoom(host.sub)).toBeNull();
    expect((await instance.upsertMember(outsider.sub, outsider.name)).ok).toBe(
      false,
    );
  });
  await env.DB.prepare(
    "CREATE TABLE completed_room_viewers(user_id TEXT NOT NULL,room_id TEXT NOT NULL,completed_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(user_id,room_id))",
  ).run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    expect(
      state.storage.sql
        .exec(
          "SELECT deleted,decisions_json,scenes_json,viewers_json FROM completed_room",
        )
        .one(),
    ).toEqual({
      deleted: 1,
      decisions_json: null,
      scenes_json: null,
      viewers_json: null,
    });
    for (const table of [
      "notes",
      "members",
      "progress_history",
      "progress_history_outbox",
      "note_content_receipts",
      "note_content_versions",
    ])
      expect(
        state.storage.sql.exec(`SELECT * FROM ${table}`).toArray(),
      ).toEqual([]);
    await expect(
      initializeTestRoom(instance, host.sub, host.name, {
        roomId: room.roomId,
      }),
    ).rejects.toThrow();
    expect(await state.storage.getAlarm()).toBeNull();
  });
  room.socket.close();
});

it("確定した3件が揃わない破損状態では完了成功を返さない", async () => {
  const room = await createRoomAs(host);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,'案だけ',?,'2026-09-29')",
      crypto.randomUUID(),
      host.sub,
    );
  });
  const socket = await connectRoomAs(host, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "error" });
  expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
  socket.close();
});

it("完了の外部反映が削除より遅れても期限後の本文を復活させない", async () => {
  const room = await complete();
  await runInRoomDO(room.roomId, async (instance, state) => {
    const subject = instance as unknown as {
      writeSharedOutcomeProjection(snapshot: unknown): Promise<void>;
    };
    const original = subject.writeSharedOutcomeProjection.bind(subject);
    subject.writeSharedOutcomeProjection = async (snapshot) => {
      await original(snapshot);
      state.storage.sql.exec(
        "UPDATE completed_room SET deleted=1,decisions_json=NULL,scenes_json=NULL,viewers_json=NULL,expires_at=?",
        Date.now(),
      );
      state.storage.sql.exec(
        "UPDATE shared_outcome_state SET pending_json=NULL,saved_json=NULL,expires_at=?",
        Date.now(),
      );
    };
    await instance.alarm();
    expect(
      state.storage.sql
        .exec("SELECT saved_json,pending_json FROM shared_outcome_state")
        .one(),
    ).toEqual({ saved_json: null, pending_json: null });
  });
  expect(
    await env.DB.prepare("SELECT room_id FROM shared_outcomes WHERE room_id=?")
      .bind(room.roomId)
      .first(),
  ).toBeNull();
  room.socket.close();
});

it("同一完了時刻の索引もルームIDで安定して分割し、認可で除いた行の次を取りこぼさない", async () => {
  const first = await complete();
  const second = await complete();
  await runInRoomDO(first.roomId, (instance) => instance.alarm());
  await runInRoomDO(second.roomId, (instance) => instance.alarm());
  const cursorUser = { ...host, sub: crypto.randomUUID() };
  for (const room of [first, second]) {
    await runInRoomDO(room.roomId, (_instance, state) =>
      state.storage.sql.exec(
        "UPDATE completed_room SET viewers_json=?",
        JSON.stringify([cursorUser.sub]),
      ),
    );
    await env.DB.prepare(
      "INSERT INTO completed_room_viewers(user_id,room_id,completed_at,expires_at) SELECT ?,room_id,completed_at,expires_at FROM completed_room_viewers WHERE user_id=? AND room_id=?",
    )
      .bind(cursorUser.sub, host.sub, room.roomId)
      .run();
  }
  const now = Date.now();
  // 前ページには非閲覧者の索引だけを置き、空ページでも続きへ到達する。
  for (let i = 0; i < 20; i++) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at,creation_visibility) VALUES(?,?,?,'legacy')",
    )
      .bind(id, now, now + 86400000)
      .run();
    await env.DB.prepare(
      "INSERT INTO completed_room_viewers(user_id,room_id,completed_at,expires_at) VALUES(?,?,?,?)",
    )
      .bind(cursorUser.sub, id, now + 1000, now + 86400000)
      .run();
  }
  await env.DB.prepare(
    "UPDATE completed_room_viewers SET completed_at=? WHERE room_id IN (?,?)",
  )
    .bind(now, first.roomId, second.roomId)
    .run();
  const a = (await (await request("completed-rooms", cursorUser)).json()) as {
    rooms: unknown[];
    nextCursor: string;
  };
  expect(a.rooms).toEqual([]);
  expect(a.nextCursor).not.toBeNull();
  const b = (await (
    await request(
      `completed-rooms?cursor=${encodeURIComponent(a.nextCursor)}`,
      cursorUser,
    )
  ).json()) as { rooms: Array<{ roomId: string }>; nextCursor: string | null };
  expect(b.rooms.map((r) => r.roomId)).toEqual(
    [first.roomId, second.roomId].sort().reverse(),
  );
  expect(b.nextCursor).toBeNull();
  expect((await request("completed-rooms?cursor=invalid")).status).toBe(400);
  first.socket.close();
  second.socket.close();
});

it("完了と参加・退出・解散の競合をRoomDOの成立順で確定する", async () => {
  for (const first of ["complete", "disband"] as const) {
    const room = await createRoomAs(host);
    await joinRoomAs(guest, room.inviteCode);
    await runInRoomDO(room.roomId, async (instance, state) => {
      await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
      for (const phase of [1, 2, 3])
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
          phase,
          crypto.randomUUID(),
          `確定${phase}`,
          host.sub,
          new Date().toISOString(),
        );
      const publish = () =>
        (
          instance as unknown as {
            preserveSharedOutcome(
              confirmed: boolean,
              now: number,
              participant: boolean,
            ): Promise<void>;
          }
        ).preserveSharedOutcome(true, Date.now(), true);
      if (first === "complete") {
        const completion = publish();
        const joined = instance.upsertMember(outsider.sub, outsider.name);
        const leaving = instance.leave(guest.sub);
        const disbanding = instance.disband(host.sub);
        await completion;
        await leaving;
        expect((await joined).ok).toBe(false);
        expect(await disbanding).toBe(false);
        expect(await instance.getCompletedRoom(guest.sub)).not.toBeNull();
        expect(await instance.getCompletedRoom(outsider.sub)).toBeNull();
      } else {
        const disband = instance.disband(host.sub);
        await expect(publish()).rejects.toThrow();
        expect(await disband).toBe(true);
        expect(await instance.getCompletedRoom(host.sub)).toBeNull();
        expect(
          (await instance.upsertMember(outsider.sub, outsider.name)).ok,
        ).toBe(false);
      }
    });
  }
});

it("完了後の古い招待コード照会はホスト名・招待情報を返さない", async () => {
  const room = await complete();
  const response = await request(
    `rooms/lookup?code=${room.inviteCode}`,
    outsider,
  );
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(host.name);
  room.socket.close();
});

it("A15: 初回完了由来の期限1ms前・等値・1ms後で、本文と索引が残っていても全取得経路が期限を守る", async () => {
  const completedTime = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(completedTime);
  let socket: Awaited<ReturnType<typeof connectRoomAs>> | undefined;
  try {
    const { recordProgressTransition } = await import(
      "./room/progress-history"
    );
    const room = await complete(async (_instance, state) => {
      recordProgressTransition(
        state.storage.sql,
        { kind: "step", phase: 1, step: 3 },
        { kind: "step", phase: 1, step: 4 },
        "next",
      );
      state.storage.sql.exec(
        "DELETE FROM progress_history WHERE exited_at IS NULL",
      );
    });
    socket = room.socket;
    await runInRoomDO(room.roomId, (instance) => instance.alarm());
    const first = (await (
      await request(`completed-rooms/${room.roomId}`)
    ).json()) as { completedAt: number; expiresAt: number };
    expect(first.completedAt).toBe(completedTime);
    expect(first.expiresAt).toBe(completedTime + 30 * 86400000);

    async function retainedData() {
      const local = await runInRoomDO(room.roomId, (_instance, state) => ({
        completion: state.storage.sql
          .exec(
            "SELECT completed_at,expires_at,decisions_json,viewers_json,deleted FROM completed_room",
          )
          .one(),
        outcome: state.storage.sql
          .exec("SELECT expires_at,saved_json FROM shared_outcome_state")
          .one(),
        history: state.storage.sql
          .exec(
            "SELECT h.id,o.snapshot_json FROM progress_history h JOIN progress_history_outbox o ON o.record_id=h.id",
          )
          .toArray(),
      }));
      const index = await env.DB.prepare(
        "SELECT expires_at FROM completed_room_viewers WHERE room_id=? ORDER BY user_id",
      )
        .bind(room.roomId)
        .all<{ expires_at: number }>();
      const outcome = await env.DB.prepare(
        "SELECT expires_at,snapshot_json FROM shared_outcomes WHERE room_id=?",
      )
        .bind(room.roomId)
        .first<{ expires_at: number; snapshot_json: string }>();
      const history = await env.DB.prepare(
        "SELECT expires_at,snapshot_json FROM progress_history_snapshots WHERE room_id=?",
      )
        .bind(room.roomId)
        .all<{ expires_at: number; snapshot_json: string }>();
      expect(local.completion.deleted).toBe(0);
      expect(local.completion.decisions_json).not.toBeNull();
      expect(local.completion.viewers_json).not.toBeNull();
      expect(local.completion.completed_at).toBe(completedTime);
      expect(local.completion.expires_at).toBe(first.expiresAt);
      expect(local.outcome.expires_at).toBe(first.expiresAt);
      expect(local.outcome.saved_json).not.toBeNull();
      expect(local.history).toHaveLength(1);
      expect(local.history[0].snapshot_json).not.toBeNull();
      expect(index.results).toHaveLength(2);
      expect(
        index.results.every((row) => row.expires_at === first.expiresAt),
      ).toBe(true);
      expect(outcome?.expires_at).toBe(first.expiresAt);
      expect(outcome?.snapshot_json).not.toBeNull();
      expect(history.results).toHaveLength(1);
      expect(history.results[0].expires_at).toBe(first.expiresAt);
      expect(history.results[0].snapshot_json).not.toBeNull();
    }

    // 閲覧・退出・公開再送の操作時刻を初回完了と異ならせ、期限を採り直さないことを確認する。
    clock.mockReturnValue(completedTime + 12345);
    expect(
      (await request(`completed-rooms/${room.roomId}/scenes/problem-grouping`))
        .status,
    ).toBe(200);
    expect(
      (await request(`rooms/${room.roomId}/leave`, guest, "POST")).status,
    ).toBe(204);
    expect(
      (await request(`completed-rooms/${room.roomId}`, guest)).status,
    ).toBe(200);
    expect(await room.socket.next()).toMatchObject({
      type: "member_left",
      userId: guest.sub,
    });
    room.socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
    expect(await room.socket.next()).toMatchObject({
      type: "outcome:published",
    });
    await retainedData();

    for (const offset of [-1, 0, 1]) {
      clock.mockReturnValue(first.expiresAt + offset);
      // alarmや管理者取得を呼ばない。削除前の残存本文・索引を検証の前後で確認する。
      await retainedData();
      const list = await request("completed-rooms");
      expect(list.status).toBe(200);
      expect(list.headers.get("cache-control")).toBe("private, no-store");
      const listed = (await list.json()) as {
        rooms: Array<{ roomId: string }>;
      };
      expect(listed.rooms.some((item) => item.roomId === room.roomId)).toBe(
        offset < 0,
      );
      const detailResponse = await request(`completed-rooms/${room.roomId}`);
      const sceneResponse = await request(
        `completed-rooms/${room.roomId}/scenes/problem-grouping`,
      );
      expect(detailResponse.status).toBe(offset < 0 ? 200 : 404);
      expect(sceneResponse.status).toBe(offset < 0 ? 200 : 404);
      expect(detailResponse.headers.get("cache-control")).toBe(
        "private, no-store",
      );
      expect(sceneResponse.headers.get("cache-control")).toBe(
        "private, no-store",
      );
      if (offset < 0) {
        expect(await detailResponse.json()).toMatchObject({
          completedAt: completedTime,
          expiresAt: first.expiresAt,
          idea: "決定3",
        });
        expect(await sceneResponse.json()).toMatchObject({
          scene: { status: "saved" },
          board: { kind: "problem-grouping", notes: [] },
        });
      } else {
        const notFound = { error: "ルームが見つかりませんでした。" };
        expect(await detailResponse.json()).toEqual(notFound);
        expect(await sceneResponse.json()).toEqual(notFound);
      }
      await retainedData();
    }
  } finally {
    clock.mockRestore();
    socket?.close();
  }
});

it("導入前の完了ルームでも稼働中タイマーを停止し、過去のアラームを再予約しない", async () => {
  const room = await createRoomAs(host);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const now = Date.now();
    state.storage.sql.exec(
      "UPDATE room_state SET outcome_published=1 WHERE id=1",
    );
    state.storage.sql.exec(
      "UPDATE timer_state SET status='running',ends_at=?,duration_ms=60000 WHERE id=1",
      now + 10000,
    );
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 20000);
    try {
      await instance.alarm();
      expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now());
      expect(
        state.storage.sql.exec("SELECT status FROM timer_state").one().status,
      ).toBe("idle");
      await instance.alarm();
      expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now());
    } finally {
      clock.mockRestore();
    }
  });
});

it("旧完了ルームもホスト本人が退出でき、未完了ホスト・非メンバー・未認証は許可しない", async () => {
  const room = await createRoomAs(host);
  expect(
    (
      await request(`rooms/${room.roomId}/leave`, host, "POST", {
        intent: "self",
      })
    ).status,
  ).toBe(409);
  await runInRoomDO(room.roomId, (_instance, state) => {
    state.storage.sql.exec(
      "UPDATE room_state SET outcome_published=1 WHERE id=1",
    );
  });
  expect(
    (
      await request(`rooms/${room.roomId}/leave`, outsider, "POST", {
        intent: "self",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await worker.fetch(
        new Request(`https://api.test/api/rooms/${room.roomId}/leave`, {
          method: "POST",
        }),
        env,
      )
    ).status,
  ).toBe(401);
  expect(
    (await request(`rooms/${room.roomId}/leave`, host, "POST")).status,
  ).toBe(409);
  expect(
    (
      await request(`rooms/${room.roomId}/leave`, host, "POST", {
        intent: "self",
      })
    ).status,
  ).toBe(204);
  expect((await request(`rooms/${room.roomId}`)).status).toBe(404);
  expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
  expect(
    await env.DB.prepare("SELECT id FROM rooms WHERE id=?")
      .bind(room.roomId)
      .first(),
  ).not.toBeNull();
});

it("完了期限を過ぎた退出の清掃でもルーム内の呼び名を消去する", async () => {
  const room = await complete((_instance, state) => {
    state.storage.sql.exec(
      "INSERT INTO member_display_names(user_id,name) VALUES(?,?)",
      host.sub,
      "ルームの呼び名",
    );
    state.storage.sql.exec(
      "UPDATE members SET name=? WHERE user_id=?",
      "ルームの呼び名",
      host.sub,
    );
  });
  await runInRoomDO(room.roomId, (_instance, state) => {
    state.storage.sql.exec(
      "UPDATE completed_room SET expires_at=?",
      Date.now() - 1,
    );
  });
  // leave→completed.flushは共有成果の清掃を経ずに完了期限を清掃する。
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)).leave(
    guest.sub,
    "discard",
  );
  await runInRoomDO(room.roomId, (_instance, state) => {
    expect(
      state.storage.sql
        .exec("SELECT deleted FROM completed_room WHERE id=1")
        .one().deleted,
    ).toBe(1);
    expect(
      state.storage.sql.exec("SELECT * FROM member_display_names").toArray(),
    ).toEqual([]);
  });
  room.socket.close();
});
