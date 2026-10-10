import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runInRoomDO, sessionCookieFor } from "../test-helpers";
import { ensureUser, findRoomById } from "./db";
import { reserveRoomCreation } from "./room-creation";

const owner = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};
const other = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "other@example.test",
  name: "Other",
};
function v7(time = Date.now()) {
  const hex = time.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7abc-8abc-${crypto.randomUUID().slice(-12)}`;
}
async function post(
  requestId: string,
  expectedPrincipal = owner.sub,
  user = owner,
) {
  return SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId, expectedPrincipal, name: "test" }),
  });
}
describe("24h作成と独立した公開・回復契約", () => {
  it("別アカウントへ切替した古い要求は副作用前に拒否", async () => {
    const id = v7();
    expect((await post(id, owner.sub, other)).status).toBe(403);
    expect(
      await env.DB.prepare(
        "SELECT * FROM room_creation_requests WHERE request_id=?",
      )
        .bind(id)
        .first(),
    ).toBeNull();
  });
  it("同値の大小requestIdは同じルーム", async () => {
    const id = v7();
    const first = await post(id);
    expect(first.status).toBe(200);
    const second = await post(id.toUpperCase());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });
  it("期限一致以降はcron未実行でも新規予約しない", async () => {
    expect((await post(v7(Date.now() - 86400000))).status).toBe(410);
  });
  it("要求詳細を消しても未成立directoryは公開しない", async () => {
    await ensureUser(env.DB, { id: owner.sub, email: owner.email });
    const creation = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
    await env.DB.prepare("DELETE FROM room_creation_requests WHERE room_id=?")
      .bind(creation.room_id)
      .run();
    expect(await findRoomById(env.DB, creation.room_id)).toBeNull();
    const { creationIdentity } = await import("./room-creation");
    await env.ROOM_DO.get(
      env.ROOM_DO.idFromName(creation.room_id),
    ).initializeCreation(creationIdentity(creation), owner.name, creation.name);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,'shared_outcomes:read')",
    )
      .bind(owner.sub)
      .run();
    const cookie = await sessionCookieFor(owner);
    for (const path of [
      `/api/rooms/${creation.room_id}`,
      `/api/rooms/${creation.room_id}/members`,
      `/api/rooms/${creation.room_id}/ws`,
      `/api/rooms/lookup?code=${creation.invite_code}`,
      `/api/shared-outcomes/${creation.room_id}`,
      `/api/shared-outcomes/${creation.room_id}/history`,
      `/api/completed-rooms/${creation.room_id}`,
    ]) {
      expect(
        (
          await SELF.fetch(`https://api.test${path}`, {
            headers: { Cookie: cookie, Upgrade: "websocket" },
          })
        ).status,
      ).toBe(404);
    }
    for (const path of [
      `/api/rooms/${creation.room_id}/leave`,
      `/api/rooms/${creation.room_id}/feedback`,
    ])
      expect(
        (
          await SELF.fetch(`https://api.test${path}`, {
            method: "POST",
            headers: { Cookie: cookie, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        ).status,
      ).toBe(404);
  });
  it("旧RPCはmarkerなしの既存メンバー状態を再初期化しない", async () => {
    const roomId = crypto.randomUUID();
    await runInRoomDO(roomId, async (instance) => {
      await instance.upsertMember(owner.sub, owner.name);
    });
    await runInRoomDO(roomId, async (instance, state) => {
      const before = state.storage.sql
        .exec("SELECT * FROM room_state")
        .toArray();
      await expect(
        instance.initializeNewRoom(owner.sub, owner.name, { roomId }),
      ).rejects.toThrow();
      expect(
        state.storage.sql.exec("SELECT * FROM room_state").toArray(),
      ).toEqual(before);
    });
  });
  it("期限後の結果照会は本人だけにread-onlyで既知結果を返す", async () => {
    const id = v7();
    const created = await post(id);
    const result = await created.json();
    const response = await SELF.fetch(
      `https://api.test/api/room-creations/${id}?expectedPrincipal=${owner.sub}`,
      { headers: { Cookie: await sessionCookieFor(owner) } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "ready",
      ...(result as object),
    });
    const outsider = await SELF.fetch(
      `https://api.test/api/room-creations/${id}?expectedPrincipal=${other.sub}`,
      { headers: { Cookie: await sessionCookieFor(other) } },
    );
    expect(await outsider.json()).toMatchObject({ kind: "unknown" });
  });
});

it("cronは期限切れ未初期化をDOで閉鎖してから整理する", async () => {
  const { createApiWorker } = await import("../api-worker");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "private name");
  // UUID v7 の発行時刻と期限は、同じ基準時刻から作る。
  const expiresAt = Date.now() - 600000;
  const expiredId = v7(expiresAt - 86400000);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE room_creation_control SET request_id=?,expires_at=? WHERE room_id=?",
    ).bind(expiredId, expiresAt, c.room_id),
    env.DB.prepare(
      "UPDATE room_creation_requests SET request_id=? WHERE room_id=?",
    ).bind(expiredId, c.room_id),
    env.DB.prepare(
      "UPDATE room_creation_policy SET cleanup_enabled=1 WHERE id=1",
    ),
  ]);
  await createApiWorker().scheduled({} as ScheduledController, env);
  expect(
    await env.DB.prepare("SELECT * FROM room_creation_requests WHERE room_id=?")
      .bind(c.room_id)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT * FROM rooms WHERE id=?")
      .bind(c.room_id)
      .first(),
  ).toBeNull();
  await runInRoomDO(c.room_id, (_instance, state) =>
    expect(
      state.storage.sql
        .exec("SELECT closed FROM room_creation_marker WHERE id=1")
        .one().closed,
    ).toBe(1),
  );
});

it("発行と未認証照会はルーム副作用を持たない", async () => {
  const before = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM rooms",
  ).first();
  for (const path of [
    "/api/room-creations/issue",
    `/api/room-creations/${v7()}?expectedPrincipal=${owner.sub}`,
  ]) {
    expect(
      (
        await SELF.fetch(`https://api.test${path}`, {
          method: path.endsWith("issue") ? "POST" : "GET",
        })
      ).status,
    ).toBe(401);
  }
  const issued = await SELF.fetch("https://api.test/api/room-creations/issue", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(owner),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expectedPrincipal: owner.sub }),
  });
  expect(issued.status).toBe(200);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM rooms").first(),
  ).toEqual(before);
});
it("受付期限後もread-only statusがreadyを返し、POSTは拒否", async () => {
  const id = v7();
  const response = await post(id);
  const room = await response.json();
  await env.DB.prepare(
    "UPDATE room_creation_control SET expires_at=0 WHERE user_id=? AND request_id=?",
  )
    .bind(owner.sub, id)
    .run();
  expect((await post(id)).status).toBe(410);
  const status = await SELF.fetch(
    `https://api.test/api/room-creations/${id}?expectedPrincipal=${owner.sub}`,
    { headers: { Cookie: await sessionCookieFor(owner) } },
  );
  expect(await status.json()).toEqual({
    kind: "ready",
    acceptance: "expired",
    ...(room as object),
  });
});
it("遅いready応答は解散・削除後に公開gateを復活させない", async () => {
  const { completeRoomCreation, creationIdentity, CreationGone } = await import(
    "./room-creation"
  );
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
  let release!: () => void, initialized!: () => void;
  const ready = new Promise<void>((r) => {
    initialized = r;
  });
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const completing = completeRoomCreation(env.DB, c, async () => {
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(c.room_id)).initializeCreation(
      creationIdentity(c),
      owner.name,
      c.name,
    );
    initialized();
    await barrier;
  });
  const rejection = expect(completing).rejects.toBeInstanceOf(CreationGone);
  await ready;
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(c.room_id)).disband(owner.sub);
  await env.DB.prepare("DELETE FROM rooms WHERE id=?").bind(c.room_id).run();
  release();
  await rejection;
  expect(
    await env.DB.prepare("SELECT * FROM rooms WHERE id=?")
      .bind(c.room_id)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT creation_visibility FROM shared_outcomes WHERE room_id=?",
    )
      .bind(c.room_id)
      .first(),
  ).toEqual({ creation_visibility: "hidden" });
});
it("DO閉鎖が先に確定した後は時計が戻っても遅延初期化しない", async () => {
  const { vi } = await import("vitest");
  const { creationIdentity } = await import("./room-creation");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
  const identity = creationIdentity(c);
  await runInRoomDO(c.room_id, async (instance, state) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(identity.expiresAt);
    try {
      expect(await instance.inspectOrCloseExpiredCreation(identity)).toBe(
        "closed",
      );
      clock.mockReturnValue(identity.expiresAt - 1);
      expect(
        await instance.initializeCreation(identity, owner.name, c.name),
      ).toBe("closed");
      expect(state.storage.sql.exec("SELECT * FROM members").toArray()).toEqual(
        [],
      );
    } finally {
      clock.mockRestore();
    }
  });
});
it("期限前DO初期化は期限後の照合・公開でも保全", async () => {
  const { vi } = await import("vitest");
  const { creationIdentity, publishRoomCreation } = await import(
    "./room-creation"
  );
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
  const identity = creationIdentity(c);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(c.room_id)).initializeCreation(
    identity,
    owner.name,
    c.name,
  );
  await runInRoomDO(c.room_id, async (instance) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(identity.expiresAt);
    try {
      expect(await instance.inspectOrCloseExpiredCreation(identity)).toBe(
        "ready",
      );
    } finally {
      clock.mockRestore();
    }
  });
  await publishRoomCreation(env.DB, c);
  expect(await findRoomById(env.DB, c.room_id)).not.toBeNull();
});
it("retired watermarkは時計後退時にも新規予約を拒否", async () => {
  const id = v7();
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=? WHERE id=1",
  )
    .bind(Date.now() + 1000)
    .run();
  expect((await post(id)).status).toBe(410);
  expect(
    await env.DB.prepare(
      "SELECT * FROM room_creation_control WHERE request_id=?",
    )
      .bind(id)
      .first(),
  ).toBeNull();
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=0 WHERE id=1",
  ).run();
});
it("marker無しでownerやphase revisionのあるlegacyは新RPCでも初期化しない", async () => {
  const { creationIdentity } = await import("./room-creation");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
  await runInRoomDO(c.room_id, async (instance, state) => {
    state.storage.sql.exec(
      "UPDATE room_owner SET host_id=? WHERE id=1",
      owner.sub,
    );
    await expect(
      instance.initializeCreation(creationIdentity(c), owner.name, c.name),
    ).rejects.toThrow("再初期化");
    expect(state.storage.sql.exec("SELECT * FROM members").toArray()).toEqual(
      [],
    );
  });
});
it("初期化書込み中にdeadlineへ到達したら全transactionをrollback", async () => {
  const { vi } = await import("vitest");
  const { creationIdentity } = await import("./room-creation");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const c = await reserveRoomCreation(env.DB, owner.sub, v7(), "test");
  await runInRoomDO(c.room_id, async (instance, state) => {
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(c.expires_at)
      .mockReturnValueOnce(c.expires_at - 1)
      .mockReturnValueOnce(c.expires_at - 1);
    try {
      await expect(
        instance.initializeCreation(creationIdentity(c), owner.name, c.name),
      ).rejects.toThrow("期限");
      expect(state.storage.sql.exec("SELECT * FROM members").toArray()).toEqual(
        [],
      );
      expect(
        state.storage.sql.exec("SELECT * FROM room_creation_marker").toArray(),
      ).toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });
});
it("100件を超える詳細GCは存続controlを飛ばして次回の残りへ進む", async () => {
  const { cleanupRoomCreations } = await import("./room-creation-cleanup");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  await env.DB.prepare(
    "UPDATE room_creation_policy SET cleanup_enabled=1 WHERE id=1",
  ).run();
  const rooms: string[] = [];
  for (let i = 0; i < 101; i++) {
    const room = crypto.randomUUID();
    rooms.push(room);
    const id = v7(Date.now() - 86400000 - 600000 - i);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO room_creation_control(user_id,request_id,room_id,expires_at,status) VALUES(?,?,?,?,'ready')",
      ).bind(owner.sub, id, room, Date.now() - 600000 - i),
      env.DB.prepare(
        "INSERT INTO room_creation_requests(user_id,request_id,room_id,name,invite_code,status) VALUES(?,?,?,'must delete',?,'ready')",
      ).bind(owner.sub, id, room, `X${i}`),
      env.DB.prepare(
        "INSERT INTO rooms(id,invite_code,host_id,creation_visibility) VALUES(?,?,?,'published')",
      ).bind(room, `X${i}`, owner.sub),
    ]);
  }
  const count = async () => {
    const results = await env.DB.prepare(
      "SELECT room_id FROM room_creation_requests",
    ).all<{ room_id: string }>();
    return results.results.filter((r) => rooms.includes(r.room_id)).length;
  };
  await cleanupRoomCreations(env);
  expect(await count()).toBeGreaterThanOrEqual(1);
  await cleanupRoomCreations(env);
  expect(await count()).toBe(0);
});
it("retired時間帯の既存pendingも時計後退で受付を再開しない", async () => {
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const id = v7();
  await reserveRoomCreation(env.DB, owner.sub, id, "test");
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=? WHERE id=1",
  )
    .bind(Date.now() + 1000)
    .run();
  expect((await post(id)).status).toBe(410);
  const query = await SELF.fetch(
    `https://api.test/api/room-creations/${id}?expectedPrincipal=${owner.sub}`,
    { headers: { Cookie: await sessionCookieFor(owner) } },
  );
  expect(await query.json()).toEqual({
    kind: "unknown",
    acceptance: "expired",
  });
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=0 WHERE id=1",
  ).run();
});
it("migration後の旧Worker予約SQLはcontrolなしで新規作成できない", async () => {
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const room = crypto.randomUUID();
  await expect(
    env.DB.batch([
      env.DB.prepare(
        "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES(?,?,?,?,'OLD001','pending')",
      ).bind(owner.sub, crypto.randomUUID(), "must not retain", room),
      env.DB.prepare(
        "INSERT INTO rooms(id,host_id,invite_code) VALUES(?,?,'OLD001')",
      ).bind(room, owner.sub),
    ]),
  ).rejects.toThrow("protocol upgrade");
  expect(
    await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(room).first(),
  ).toBeNull();
});
it("legacy directoryの成果索引欠落は明示legacy証拠から回復できる", async () => {
  const { insertRoom } = await import("./db");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const room = await insertRoom(env.DB, owner.sub);
  await env.DB.prepare("DELETE FROM shared_outcomes WHERE room_id=?")
    .bind(room.roomId)
    .run();
  const { isCreationPublished } = await import("./room-creation");
  expect(await isCreationPublished(env.DB, room.roomId)).toBe(true);
});
