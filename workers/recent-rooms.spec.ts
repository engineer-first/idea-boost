import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { RecentRoomsResponseSchema } from "../contracts/recent-rooms";
import worker from "./api-worker";
import {
  connectRoomAs,
  createRoomAs,
  endTimerForTest,
  joinRoomAs,
  runInRoomDO,
  sessionCookieFor,
  type TestUser,
} from "./test-helpers";

function user(n: number): TestUser {
  const hex = String(n).repeat(8).slice(0, 8);
  return {
    sub: `${hex}-${hex.slice(0, 4)}-4${hex.slice(0, 3)}-8${hex.slice(0, 3)}-${hex}${hex.slice(0, 4)}`,
    name: `User${n}`,
    email: `user${n}@test.invalid`,
  };
}
async function recentRooms(who?: TestUser) {
  return worker.fetch(
    new Request("https://api.test/api/recent-rooms", {
      headers: who ? { Cookie: await sessionCookieFor(who) } : {},
    }),
    env,
  );
}
async function completeAs(creator: TestUser, participant: TestUser) {
  const room = await createRoomAs(creator);
  await joinRoomAs(participant, room.inviteCode);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, creator.sub);
    for (const phase of [1, 2, 3])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        creator.sub,
        new Date().toISOString(),
      );
  });
  await endTimerForTest(room.roomId);
  const socket = await connectRoomAs(creator, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  socket.close();
  // 一覧索引（D1）への投影はアラームで確定する。
  await runInRoomDO(room.roomId, (instance) => instance.alarm());
  return room;
}

describe("ホームの最近参加したルーム", () => {
  it("未認証は401で、参加していないルームは出さない", async () => {
    const owner = user(1);
    const outsider = user(2);
    await createRoomAs(owner);
    await completeAs(owner, user(5));
    expect((await recentRooms()).status).toBe(401);
    const response = await recentRooms(outsider);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ rooms: [] });
  });

  it("参加中のルームを先に、完了したルームを新しい順に最大3件返す", async () => {
    const me = user(3);
    const other = user(4);
    const completed = [];
    for (let i = 0; i < 3; i++) completed.push(await completeAs(me, user(6)));
    const active = await createRoomAs(other);
    await joinRoomAs(me, active.inviteCode);
    const response = await recentRooms(me);
    expect(response.status).toBe(200);
    const body = RecentRoomsResponseSchema.parse(await response.json());
    expect(body.rooms.map((room) => [room.roomId, room.status])).toEqual([
      [active.roomId, "active"],
      [completed[2].roomId, "completed"],
      [completed[1].roomId, "completed"],
    ]);
    expect(body.rooms[0].label).toBe(`ルーム ${active.inviteCode}`);
    expect(body.rooms[1].label).toBe("決定3");
    expect(JSON.stringify(body)).not.toMatch(/User4|inviteCode|authorId/);
  });

  it("各ルームに作成日と自動削除の予定日時を付ける", async () => {
    const me = user(9);
    const other = user(6);
    const before = Date.now() - 60_000;
    const completed = await completeAs(me, other);
    const active = await createRoomAs(other);
    await joinRoomAs(me, active.inviteCode);
    const body = RecentRoomsResponseSchema.parse(
      await (await recentRooms(me)).json(),
    );
    const byId = new Map(body.rooms.map((room) => [room.roomId, room]));
    for (const roomId of [active.roomId, completed.roomId]) {
      const room = byId.get(roomId);
      expect(room?.createdAt).toBeGreaterThanOrEqual(before - 1000);
      expect(room?.createdAt).toBeLessThanOrEqual(Date.now());
      expect(room?.expiresAt).toBeGreaterThan(Date.now());
    }
  });

  it("退出したルームは参加候補に残っていても出さない", async () => {
    const me = user(7);
    const other = user(8);
    const room = await createRoomAs(other);
    await joinRoomAs(me, room.inviteCode);
    expect(
      RecentRoomsResponseSchema.parse(await (await recentRooms(me)).json())
        .rooms,
    ).toHaveLength(1);
    const left = await worker.fetch(
      new Request(`https://api.test/api/rooms/${room.roomId}/leave`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(me),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intent: "self" }),
      }),
      env,
    );
    expect(left.status).toBe(204);
    expect(await (await recentRooms(me)).json()).toEqual({ rooms: [] });
  });
});
