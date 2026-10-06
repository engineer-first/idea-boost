import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { buildSharedOutcome } from "../contracts/shared-outcomes.fixture";
import { handleSharedOutcomes } from "./shared-outcomes-api";
import { createRoomAs } from "./test-helpers";

it("一覧の各ルームは並行取得し、各ルーム内は初期化の後に読み取る", async () => {
  const owner = {
    sub: crypto.randomUUID(),
    name: "Owner",
    email: "owner@test.invalid",
  };
  const rooms = await Promise.all([createRoomAs(owner), createRoomAs(owner)]);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Set<string>();
  const ready = new Set<string>();
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {
        started.add(id);
        await barrier;
        ready.add(id);
      },
      getSharedOutcome: async () => {
        expect(ready.has(id)).toBe(true);
        return id === rooms[0].roomId
          ? buildSharedOutcome({ roomId: id })
          : null;
      },
    }),
  } as unknown as typeof env.ROOM_DO;
  const response = handleSharedOutcomes(
    new Request("https://api.test/api/shared-outcomes", {
      headers: {},
    }),
    { ...env, ROOM_DO: namespace },
  );
  try {
    await vi.waitFor(() => expect(started.size).toBe(2));
  } finally {
    release();
    await response;
  }
  const body = await (await response).json<{
    outcomes: unknown[];
    nextCursor: string | null;
  }>();
  expect(body.outcomes).toHaveLength(1);
  expect(body.outcomes[0]).toMatchObject({ roomId: rooms[0].roomId });
  expect(body.outcomes[0]).not.toHaveProperty("snapshot");
  expect(body.nextCursor).toBeNull();
});

it("名前・表示用ID・内部IDと記録・到達点の条件を組み合わせ、期限切れを検索結果に含めない", async () => {
  const records = [
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      name: "受付 改善",
      displayId: "R-ABC123",
      status: "confirmed",
    }),
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      name: "受付 改善",
      status: "partial",
    }),
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      name: "別ルーム",
      status: "confirmed",
      phase: { kind: "lobby" },
    }),
  ];
  for (const record of records) {
    await env.DB.prepare(
      "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
    )
      .bind(record.roomId, record.lastUsedAt, record.expiresAt)
      .run();
  }
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {},
      getSharedOutcome: async () =>
        records.find((record) => record.roomId === id) ?? null,
    }),
  } as unknown as typeof env.ROOM_DO;
  async function search(query: string) {
    const result = await handleSharedOutcomes(
      new Request(`https://api.test/api/shared-outcomes?${query}`),
      { ...env, ROOM_DO: namespace },
    );
    return result.json<{ outcomes: Array<{ roomId: string }> }>();
  }
  expect(
    (await search("q=受付&status=confirmed&phase=3")).outcomes.map(
      (r) => r.roomId,
    ),
  ).toEqual([records[0].roomId]);
  expect((await search("q=r-abc123")).outcomes.map((r) => r.roomId)).toEqual([
    records[0].roomId,
  ]);
  expect(
    (await search(`q=${records[1].roomId}`)).outcomes.map((r) => r.roomId),
  ).toEqual([records[1].roomId]);
  expect((await search("phase=lobby")).outcomes.map((r) => r.roomId)).toEqual([
    records[2].roomId,
  ]);
});

it.each([
  "status=unknown",
  "phase=4",
  "cursor=-1",
  "from=2026-02-30",
  "to=2026-13-01",
  "from=2026-9-1",
  "from=0000-01-01",
  "from=2026-09-30&to=2026-09-01",
  `q=${"x".repeat(201)}`,
])("不正な検索条件 %s を拒否する", async (query) => {
  const result = await handleSharedOutcomes(
    new Request(`https://api.test/api/shared-outcomes?${query}`),
    env,
  );
  expect(result.status).toBe(400);
});

it("最終利用日を日本時間の両端を含む期間で絞り、片方だけの指定と検索を組み合わせる", async () => {
  const start = Date.parse("2026-09-27T00:00:00+09:00");
  const records = [-1, 0, 24 * 60 * 60 * 1000 - 1, 24 * 60 * 60 * 1000].map(
    (offset) =>
      buildSharedOutcome({
        roomId: crypto.randomUUID(),
        name: "日付で探すルーム",
        lastUsedAt: start + offset,
      }),
  );
  await env.DB.batch(
    records.map((record) =>
      env.DB.prepare(
        "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
      ).bind(record.roomId, start - 1, record.expiresAt),
    ),
  );
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {},
      getSharedOutcome: async () =>
        records.find((record) => record.roomId === id) ?? null,
    }),
  } as unknown as typeof env.ROOM_DO;
  async function search(query: string) {
    const result = await handleSharedOutcomes(
      new Request(`https://api.test/api/shared-outcomes?${query}`),
      { ...env, ROOM_DO: namespace },
    );
    return (
      await result.json<{ outcomes: Array<{ roomId: string }> }>()
    ).outcomes.map((record) => record.roomId);
  }
  expect(await search("q=日付&from=2026-09-27&to=2026-09-27")).toEqual([
    records[2].roomId,
    records[1].roomId,
  ]);
  expect(await search("from=2026-09-27")).toEqual([
    records[3].roomId,
    records[2].roomId,
    records[1].roomId,
  ]);
  expect(await search("to=2026-09-27")).toEqual([
    records[2].roomId,
    records[1].roomId,
    records[0].roomId,
  ]);
  expect(await search("from=2026-09-29")).toEqual([]);
});

it.each([
  "q=探している",
  "from=2026-09-27&to=2026-09-27",
])("検索条件 %s が最初の50候補に一致しなくても続きの成果を見つける", async (query) => {
  const records = Array.from({ length: 51 }, (_, index) =>
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      name: index === 50 ? "探しているルーム" : "別ルーム",
      lastUsedAt:
        Date.parse(
          index === 50
            ? "2026-09-27T12:00:00+09:00"
            : "2026-09-28T12:00:00+09:00",
        ) - index,
    }),
  );
  for (const record of records) {
    await env.DB.prepare(
      "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
    )
      .bind(record.roomId, record.lastUsedAt, record.expiresAt)
      .run();
  }
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {},
      getSharedOutcome: async () =>
        records.find((record) => record.roomId === id) ?? null,
    }),
  } as unknown as typeof env.ROOM_DO;
  const response = await handleSharedOutcomes(
    new Request(`https://api.test/api/shared-outcomes?${query}`),
    { ...env, ROOM_DO: namespace },
  );
  expect(await response.json()).toMatchObject({
    outcomes: [expect.objectContaining({ roomId: records[50].roomId })],
    nextCursor: null,
  });
});

it("検索中に期限切れの索引が削除されても次の候補を飛ばさない", async () => {
  const now = Date.now();
  const records = Array.from({ length: 51 }, (_, index) =>
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      lastUsedAt: now - index,
      name: "期限後も探せる成果",
    }),
  );
  for (const record of records)
    await env.DB.prepare(
      "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
    )
      .bind(record.roomId, record.lastUsedAt, record.expiresAt)
      .run();
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {},
      getSharedOutcome: async () => {
        const index = records.findIndex((record) => record.roomId === id);
        if (index < 50) {
          await env.DB.prepare("DELETE FROM shared_outcomes WHERE room_id=?")
            .bind(id)
            .run();
          return null;
        }
        return records[index];
      },
    }),
  } as unknown as typeof env.ROOM_DO;
  const response = await handleSharedOutcomes(
    new Request("https://api.test/api/shared-outcomes?q=期限後"),
    { ...env, ROOM_DO: namespace },
  );
  expect(await response.json()).toMatchObject({
    outcomes: [expect.objectContaining({ roomId: records[50].roomId })],
    nextCursor: null,
  });
});

it("250候補で検索を区切り、返した取得位置からさらに探せる", async () => {
  const now = Date.now();
  const records = Array.from({ length: 251 }, (_, index) =>
    buildSharedOutcome({
      roomId: crypto.randomUUID(),
      lastUsedAt: now - index,
      name: index === 250 ? "奥にある成果" : "別ルーム",
    }),
  );
  await env.DB.batch(
    records.map((record) =>
      env.DB.prepare(
        "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
      ).bind(record.roomId, record.lastUsedAt, record.expiresAt),
    ),
  );
  const getSharedOutcome = vi.fn(
    async (id: string) =>
      records.find((record) => record.roomId === id) ?? null,
  );
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => ({
      ensureSharedOutcome: async () => {},
      getSharedOutcome: () => getSharedOutcome(id),
    }),
  } as unknown as typeof env.ROOM_DO;
  const result = await handleSharedOutcomes(
    new Request("https://api.test/api/shared-outcomes?q=奥にある"),
    { ...env, ROOM_DO: namespace },
  );
  const body = await result.json<{ outcomes: unknown[]; nextCursor: string }>();
  expect(body.outcomes).toEqual([]);
  expect(getSharedOutcome).toHaveBeenCalledTimes(250);
  const next = await handleSharedOutcomes(
    new Request(
      `https://api.test/api/shared-outcomes?q=奥にある&cursor=${encodeURIComponent(body.nextCursor)}`,
    ),
    { ...env, ROOM_DO: namespace },
  );
  expect(await next.json()).toMatchObject({
    outcomes: [expect.objectContaining({ roomId: records[250].roomId })],
    nextCursor: null,
  });
});

it("pendingの成果索引は一覧から除外しDOの旧ルーム補完を呼ばない", async () => {
  const { ensureUser } = await import("./lib/db");
  const { reserveRoomCreation } = await import("./lib/room-creation");
  const userId = crypto.randomUUID();
  await ensureUser(env.DB, { id: userId, email: `${userId}@test.invalid` });
  const creation = await reserveRoomCreation(
    env.DB,
    userId,
    crypto.randomUUID(),
    "名前を保持",
  );
  const called: string[] = [];
  const namespace = {
    idFromName: (id: string) => id,
    get: (id: string) => {
      called.push(id);
      return {
        ensureSharedOutcome: async () => {},
        getSharedOutcome: async () => null,
      };
    },
  } as unknown as typeof env.ROOM_DO;
  await handleSharedOutcomes(
    new Request("https://api.test/api/shared-outcomes"),
    { ...env, ROOM_DO: namespace },
  );
  expect(called).not.toContain(creation.room_id);
});

it("DO初期化後ready保存前も成果詳細と進行履歴へ到達できない", async () => {
  const { ensureUser } = await import("./lib/db");
  const { reserveRoomCreation } = await import("./lib/room-creation");
  const userId = crypto.randomUUID();
  await ensureUser(env.DB, { id: userId, email: `${userId}@test.invalid` });
  const creation = await reserveRoomCreation(
    env.DB,
    userId,
    crypto.randomUUID(),
    "名前を保持",
  );
  await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(creation.room_id),
  ).initializeNewRoom(userId, "Host", {
    roomId: creation.room_id,
    name: creation.name,
  });
  for (const suffix of ["", "/history", `/history/${crypto.randomUUID()}`]) {
    const response = await handleSharedOutcomes(
      new Request(
        `https://api.test/api/shared-outcomes/${creation.room_id}${suffix}`,
      ),
      env,
    );
    expect(response.status).toBe(404);
  }
  const before = await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(creation.room_id),
  ).getSharedOutcome();
  const { completeRoomCreation } = await import("./lib/room-creation");
  await completeRoomCreation(env.DB, creation, () =>
    env.ROOM_DO.get(env.ROOM_DO.idFromName(creation.room_id)).initializeNewRoom(
      userId,
      "Host",
      { roomId: creation.room_id, name: creation.name },
    ),
  );
  const visible = await handleSharedOutcomes(
    new Request(`https://api.test/api/shared-outcomes/${creation.room_id}`),
    env,
  );
  expect(visible.status).toBe(200);
  expect(await visible.json()).toMatchObject({
    name: "名前を保持",
    expiresAt: before?.expiresAt,
  });
});
