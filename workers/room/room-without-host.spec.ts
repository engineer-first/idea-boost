import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { connectRoomAs, createRoomAs, joinRoomAs } from "../test-helpers";

const creator = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "作成者",
};
const participant = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@test.example",
  name: "参加者",
};
describe("ホストのないルーム", () => {
  it("作成者が旧解散要求で退出しても他の参加者は作業を続けられる", async () => {
    const { roomId, inviteCode } = await createRoomAs(creator);
    await joinRoomAs(participant, inviteCode);
    const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    const creatorSocket = await connectRoomAs(creator, roomId);
    const participantSocket = await connectRoomAs(participant, roomId);
    await creatorSocket.next();
    await participantSocket.next();
    try {
      expect(
        await room.leaveOrDisband(
          creator.sub,
          creator.sub,
          "disband",
          999,
          "retain",
        ),
      ).toBe("left");
      expect(await room.isMember(creator.sub)).toBe(false);
      expect(await room.isMember(participant.sub)).toBe(true);
      expect(await room.isJoinable()).toBe(true);
      expect(await participantSocket.next()).toMatchObject({
        type: "member_left",
        userId: creator.sub,
      });
      participantSocket.ws.send(
        JSON.stringify({ type: "start_phase", expectedHostRevision: 999 }),
      );
      expect(await participantSocket.next()).toMatchObject({
        type: "phase:updated",
        phase: { kind: "step", phase: 1, step: 1 },
      });
      participantSocket.ws.send(
        JSON.stringify({
          type: "timer:start",
          durationMs: 60000,
          expectedHostRevision: 999,
        }),
      );
      expect(await participantSocket.next()).toMatchObject({
        type: "timer:updated",
        timer: { status: "running" },
      });
      participantSocket.ws.send(
        JSON.stringify({
          type: "note:create",
          content: "作成者の退出後も作業を続ける",
        }),
      );
      expect(await participantSocket.next()).toMatchObject({
        type: "note:inserted",
        note: {
          authorId: participant.sub,
          content: "作成者の退出後も作業を続ける",
        },
      });
    } finally {
      creatorSocket.close();
      participantSocket.close();
    }
  });
});
