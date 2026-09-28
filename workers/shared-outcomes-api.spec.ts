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
