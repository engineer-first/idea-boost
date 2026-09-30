import { createScheduledController, env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFeedbackId, FEEDBACK_RETENTION_MS } from "../contracts/feedback";
import worker from "./api-worker";
import {
  feedbackDeletionSql,
  hashFeedbackReceipt,
} from "./lib/feedback-receipt";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  sessionCookieFor,
  type TestUser,
} from "./test-helpers";

const owner: TestUser = {
  sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "feedback-owner@test.invalid",
  name: "Owner",
};
const outsider: TestUser = {
  sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  email: "feedback-reader@test.invalid",
  name: "Reader",
};
async function call(
  path: string,
  user?: TestUser,
  body?: unknown,
): Promise<Response> {
  return SELF.fetch(`https://api.test${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(user ? { Cookie: await sessionCookieFor(user) } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function input(overrides: Record<string, unknown> = {}) {
  return {
    id: createFeedbackId(),
    target: "1-3",
    kind: "difficult",
    body: "",
    rating: null,
    ...overrides,
  };
}
async function grant(user: TestUser, permission: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users(id,email,name) VALUES(?,?,?)",
  )
    .bind(user.sub, user.email, user.name)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
  )
    .bind(user.sub, permission)
    .run();
}
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM user_permissions WHERE user_id IN (?,?)")
    .bind(owner.sub, outsider.sub)
    .run();
});
describe("任意の意見", () => {
  it("未認証・非メンバーの投稿、成果閲覧者や投稿者による意見閲覧を拒否する", async () => {
    const { roomId } = await createRoomAs(owner);
    const path = `/api/rooms/${roomId}/feedback`;
    expect((await call(path, undefined, input())).status).toBe(401);
    expect((await call(path, outsider, input())).status).toBe(404);
    expect((await call("/api/feedback", owner)).status).toBe(403);
    await grant(outsider, "shared_outcomes:read");
    expect((await call("/api/feedback", outsider)).status).toBe(403);
  });
  it("種類のみと任意評価を保存し、投稿者属性を保存せず、再送を一件にまとめる", async () => {
    const { roomId } = await createRoomAs(owner);
    const body = input({ target: "app", rating: 4 });
    const path = `/api/rooms/${roomId}/feedback`;
    expect((await call(path, owner, body)).status).toBe(200);
    expect((await call(path, owner, body)).status).toBe(200);
    await grant(outsider, "feedback:read");
    const res = await call("/api/feedback", outsider);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const data = await res.json<{
      items: Record<string, unknown>[];
      nextCursor: string | null;
    }>();
    const items = data.items.filter((x) => x.id === body.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      roomId,
      target: "app",
      kind: "difficult",
      body: "",
      rating: 4,
    });
    expect(JSON.stringify(items)).not.toMatch(
      /feedback-owner|aaaaaaaa-aaaa|Owner|authorId|userId/,
    );
    const columns = await env.DB.prepare("PRAGMA table_info(feedback)").all<{
      name: string;
    }>();
    expect(columns.results.map((x) => x.name)).not.toEqual(
      expect.arrayContaining(["user_id"]),
    );
    expect(
      (await call(path, owner, { ...body, body: "別の内容" })).status,
    ).toBe(409);
    await env.DB.prepare("DELETE FROM user_permissions WHERE user_id=?")
      .bind(outsider.sub)
      .run();
    expect((await call("/api/feedback", outsider)).status).toBe(403);
  });
  it("対象・本文上限・評価・付加属性を検証する", async () => {
    const { roomId } = await createRoomAs(owner);
    const path = `/api/rooms/${roomId}/feedback`;
    for (const body of [
      input({ target: "2-5" }),
      input({ body: "a".repeat(2001) }),
      input({ rating: 3 }),
      input({ target: "app", rating: 6 }),
      input({ authorId: owner.sub }),
      input({ roomId }),
      input({ expiresAt: 0 }),
    ])
      expect((await call(path, owner, body)).status).toBe(400);
    expect(
      (await call(path, owner, input({ body: "a".repeat(2000) }))).status,
    ).toBe(200);
    expect(
      (await call(path, owner, input({ target: "unknown", body: "   " })))
        .status,
    ).toBe(200);
  });
  it("別ルームに受付IDを流用できず、解散後も既存投稿は残るが新規投稿は拒否する", async () => {
    const first = await createRoomAs(owner);
    const second = await createRoomAs(owner);
    const body = input();
    expect(
      (await call(`/api/rooms/${first.roomId}/feedback`, owner, body)).status,
    ).toBe(200);
    expect(
      (await call(`/api/rooms/${second.roomId}/feedback`, owner, body)).status,
    ).toBe(409);
    expect(
      (await call(`/api/rooms/${first.roomId}/leave`, owner, {})).status,
    ).toBe(204);
    expect(
      (await call(`/api/rooms/${first.roomId}/feedback`, owner, input()))
        .status,
    ).toBe(404);
    await grant(outsider, "feedback:read");
    const data = await (await call("/api/feedback", outsider)).json<{
      items: { id: string }[];
    }>();
    expect(data.items.some((x) => x.id === body.id)).toBe(true);
  });
  it("期限切れを即除外し、種類・対象・時刻で絞り込み、同時刻でもページ間で重複しない", async () => {
    const { roomId } = await createRoomAs(owner);
    const body = input();
    expect(
      (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
    ).toBe(200);
    await grant(outsider, "feedback:read");
    await env.DB.prepare("UPDATE feedback SET expires_at=? WHERE id=?")
      .bind(Date.now() - 1, body.id)
      .run();
    const expired = await (await call("/api/feedback", outsider)).json<{
      items: { id: string }[];
    }>();
    expect(expired.items.some((x) => x.id === body.id)).toBe(false);
    const time = Date.now();
    await env.DB.batch(
      Array.from({ length: 51 }, () =>
        env.DB.prepare(
          "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,'fixture-hash',?,'app','good','',NULL,?,?)",
        ).bind(crypto.randomUUID(), roomId, time, time + 86400000),
      ),
    );
    const query = `/api/feedback?kind=good&target=app&from=${time}&to=${time + 1}`;
    const page1 = await (await call(query, outsider)).json<{
      items: { id: string }[];
      nextCursor: string;
    }>();
    const page2 = await (
      await call(
        `${query}&cursor=${encodeURIComponent(page1.nextCursor)}`,
        outsider,
      )
    ).json<{ items: { id: string }[]; nextCursor: string | null }>();
    expect(page1.items).toHaveLength(50);
    expect(page2.items).toHaveLength(1);
    expect(
      new Set([...page1.items, ...page2.items].map((x) => x.id)).size,
    ).toBe(51);
    expect(page2.nextCursor).toBeNull();
    expect((await call("/api/feedback?target=2-5", outsider)).status).toBe(400);
  });
});

it("定期削除が失敗しても期限切れを読めず、次の実行で削除する", async () => {
  const { roomId } = await createRoomAs(owner);
  const body = input({ target: "app" });
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(200);
  await env.DB.prepare("UPDATE feedback SET expires_at=? WHERE id=?")
    .bind(Date.now() - 1, body.id)
    .run();
  const run = vi.fn().mockRejectedValue(new Error("storage unavailable"));
  const failingDb = {
    prepare: () => ({ bind: () => ({}) }),
    batch: run,
  } as unknown as D1Database;
  const controller = createScheduledController({ cron: "0 * * * *" });
  await expect(
    worker.scheduled(controller, { ...env, DB: failingDb }),
  ).rejects.toThrow("storage unavailable");
  await grant(outsider, "feedback:read");
  const data = await (await call("/api/feedback", outsider)).json<{
    items: { id: string }[];
  }>();
  expect(data.items.some((item) => item.id === body.id)).toBe(false);
  await worker.scheduled(controller, env);
  expect(
    await env.DB.prepare("SELECT id FROM feedback WHERE id=?")
      .bind(body.id)
      .first(),
  ).toBeNull();
  expect((await call("/api/shared-outcomes", outsider)).status).toBe(403);
});

it("物理削除した期限切れ投稿を同じ受付IDの再送で復活させない", async () => {
  const { roomId } = await createRoomAs(owner);
  const now = Date.now();
  const originalTime = now - 31 * 86400000;
  const stamp = originalTime.toString(16).padStart(12, "0");
  const id = `${stamp.slice(0, 8)}-${stamp.slice(8)}-7aaa-8aaa-aaaaaaaaaaaa`;
  const body = input({ id });
  await env.DB.prepare(
    "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,'expired-fixture',?,?,'difficult','',NULL,?,?)",
  )
    .bind(id, roomId, body.target, originalTime, originalTime + 30 * 86400000)
    .run();
  await worker.scheduled(createScheduledController({ cron: "0 * * * *" }), env);
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(409);
  expect(
    await env.DB.prepare("SELECT id FROM feedback WHERE id=?").bind(id).first(),
  ).toBeNull();
});

it("保存障害は本文を含まない503を返し、同じIDの再送で一件だけ保存する", async () => {
  const { roomId } = await createRoomAs(owner);
  const body = input({ body: "非公開の文章" });
  const failingDb = {
    prepare: (sql: string) => {
      if (sql.startsWith("INSERT INTO feedback"))
        throw new Error("storage unavailable");
      return env.DB.prepare(sql);
    },
  } as D1Database;
  const response = await worker.fetch(
    new Request(`https://api.test/api/rooms/${roomId}/feedback`, {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(owner),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { ...env, DB: failingDb },
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(body.body);
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(200);
});

it("投稿も投稿通知もルーム参加者のWebSocketへ送らない", async () => {
  const { roomId, inviteCode } = await createRoomAs(owner);
  await joinRoomAs(outsider, inviteCode);
  const sockets = [
    await connectRoomAs(owner, roomId),
    await connectRoomAs(outsider, roomId),
  ];
  try {
    await Promise.all(sockets.map((socket) => socket.next()));
    const received: string[] = [];
    for (const socket of sockets)
      socket.ws.addEventListener("message", (event) => {
        received.push(String(event.data));
      });
    const body = input({ body: "配信しない本文" });
    expect(
      (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
    ).toBe(200);
    await joinRoomAs(
      {
        sub: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        email: "third@test.invalid",
        name: "Third",
      },
      inviteCode,
    );
    const events = await Promise.all(sockets.map((socket) => socket.next()));
    expect(events.map((event) => event.type)).toEqual([
      "member_joined",
      "member_joined",
    ]);
    expect(received).toHaveLength(2);
    expect(received.join()).not.toContain(body.id);
    expect(received.join()).not.toContain(body.body);
    const reconnect = await connectRoomAs(outsider, roomId);
    try {
      expect(JSON.stringify(await reconnect.next())).not.toContain(body.body);
    } finally {
      reconnect.close();
    }
  } finally {
    for (const socket of sockets) socket.close();
  }
});

it("再送は初回のサーバ受信時刻と30日期限を変えず、期限直後は拒否する", async () => {
  const { roomId } = await createRoomAs(owner);
  const body = input({ id: createFeedbackId(Date.now() + 12 * 3600000) });
  const before = Date.now();
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(200);
  const record = await env.DB.prepare(
    "SELECT created_at,expires_at FROM feedback WHERE id=?",
  )
    .bind(body.id)
    .first<{ created_at: number; expires_at: number }>();
  expect(record?.created_at).toBeGreaterThanOrEqual(before);
  expect(record?.created_at).toBeLessThanOrEqual(Date.now());
  expect((record?.expires_at ?? 0) - (record?.created_at ?? 0)).toBe(
    FEEDBACK_RETENTION_MS,
  );
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(200);
  expect(
    await env.DB.prepare(
      "SELECT created_at,expires_at FROM feedback WHERE id=?",
    )
      .bind(body.id)
      .first(),
  ).toEqual(record);
  await env.DB.prepare("UPDATE feedback SET expires_at=? WHERE id=?")
    .bind(Date.now() - 1, body.id)
    .run();
  expect(
    (await call(`/api/rooms/${roomId}/feedback`, owner, body)).status,
  ).toBe(409);
});

it.each([
  0,
  24 * 60 * 60 * 1000,
])("緊急削除後は同じ受付IDの再送を拒否する（時計差%dms）", async (offset) => {
  const { roomId } = await createRoomAs(owner);
  const body = input({
    id: createFeedbackId(Date.now() + offset),
    body: "緊急削除する文章",
  });
  const path = `/api/rooms/${roomId}/feedback`;
  expect((await call(path, owner, body)).status).toBe(200);
  await env.DB.exec(await feedbackDeletionSql(body.id));
  expect((await call(path, owner, body)).status).toBe(409);
  expect(
    await env.DB.prepare("SELECT id FROM feedback WHERE id=?")
      .bind(body.id)
      .first(),
  ).toBeNull();
});

it("削除と投稿が競合しても失効登録と本文削除の間に再保存できない", async () => {
  const { roomId } = await createRoomAs(owner);
  const path = `/api/rooms/${roomId}/feedback`;
  for (const deleteFirst of [true, false]) {
    const body = input();
    const remove = async () => env.DB.exec(await feedbackDeletionSql(body.id));
    const submit = async () => call(path, owner, body);
    await Promise.all(
      deleteFirst ? [remove(), submit()] : [submit(), remove()],
    );
    expect(
      await env.DB.prepare("SELECT id FROM feedback WHERE id=?")
        .bind(body.id)
        .first(),
    ).toBeNull();
    expect((await call(path, owner, body)).status).toBe(409);
  }
});

it("未来24時間のIDも再受付窓の終端まで失効し、その後は失効hashを掃除しても復活しない", async () => {
  const { roomId } = await createRoomAs(owner);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const window = 24 * 60 * 60 * 1000;
  const body = input({ id: createFeedbackId(now + window) });
  const request = async () =>
    worker.fetch(
      new Request(`https://api.test/api/rooms/${roomId}/feedback`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(owner),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  try {
    expect((await request()).status).toBe(200);
    await env.DB.exec(await feedbackDeletionSql(body.id.toUpperCase()));
    const hash = await hashFeedbackReceipt(body.id);
    const expiry = now + 2 * window;
    expect(
      await env.DB.prepare(
        "SELECT expires_at FROM feedback_revocations WHERE id_hash=?",
      )
        .bind(hash)
        .first(),
    ).toEqual({ expires_at: expiry });
    clock.mockReturnValue(expiry);
    await worker.scheduled(
      createScheduledController({ cron: "0 * * * *" }),
      env,
    );
    expect((await request()).status).toBe(409);
    expect(
      await env.DB.prepare(
        "SELECT id_hash FROM feedback_revocations WHERE id_hash=?",
      )
        .bind(hash)
        .first(),
    ).not.toBeNull();
    clock.mockReturnValue(expiry + 1);
    await worker.scheduled(
      createScheduledController({ cron: "0 * * * *" }),
      env,
    );
    expect(
      await env.DB.prepare(
        "SELECT id_hash FROM feedback_revocations WHERE id_hash=?",
      )
        .bind(hash)
        .first(),
    ).toBeNull();
    expect((await request()).status).toBe(409);
    expect(
      await env.DB.prepare("SELECT id FROM feedback WHERE id=?")
        .bind(body.id)
        .first(),
    ).toBeNull();
  } finally {
    clock.mockRestore();
  }
});
