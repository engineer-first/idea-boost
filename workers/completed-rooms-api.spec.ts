import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import type { CompletedRoomsResponse } from "../contracts/completed-rooms";
import { completedRoomFixture } from "../contracts/completed-rooms.fixture";
import { handleCompletedRooms } from "./completed-rooms-api";

it("一覧を並行取得し、応答順によらず索引順を保ち、閲覧できないルームを除く", async () => {
  const userId = crypto.randomUUID();
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
  const now = Date.now();
  for (const [index, id] of ids.entries()) {
    await env.DB.prepare(
      "INSERT INTO completed_room_viewers(user_id,room_id,completed_at,expires_at) VALUES(?,?,?,?)",
    )
      .bind(userId, id, now - index, now + 86400000)
      .run();
  }
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Set<string>();
  const finished: string[] = [];
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      getCompletedRoom: async (viewerId: string) => {
        expect(viewerId).toBe(userId);
        started.add(id);
        if (id === ids[0]) await barrier;
        finished.push(id);
        return id === ids[1] ? null : completedRoomFixture({ roomId: id });
      },
    }),
  } as unknown as typeof env.ROOM_DO;
  const response = handleCompletedRooms(
    new Request("https://api.test/api/completed-rooms"),
    { ...env, ROOM_DO: namespace },
    userId,
  );
  try {
    await vi.waitFor(() => expect(started.size).toBe(3));
    expect(finished).toEqual([ids[1], ids[2]]);
  } finally {
    release();
    await response;
  }
  const body = await (await response).json<CompletedRoomsResponse>();
  expect(body.rooms.map((room) => room.roomId)).toEqual([ids[0], ids[2]]);
  expect(body.nextCursor).toBeNull();
});
