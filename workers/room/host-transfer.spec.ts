import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
} from "../test-helpers";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "作成者",
};
const B = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@test.example",
  name: "参加者",
};
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
describe("旧クライアントの移譲要求", () => {
  it.each([A, B])(
    "在籍者 $name の移譲要求を拒否し、既存のホスト列や進行を変更しない",
    async (actor) => {
      const { roomId, inviteCode } = await createRoomAs(A);
      await joinRoomAs(B, inviteCode);
      const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
      const socket = await connectRoomAs(actor, roomId);
      sockets.push(socket);
      const snapshot = await socket.next();
      expect(snapshot).not.toHaveProperty("isHost");
      expect(snapshot).not.toHaveProperty("hostUserId");
      const before = await runInRoomDO(roomId, (_, state) =>
        state.storage.sql.exec("SELECT * FROM room_owner").toArray(),
      );
      const operationId = crypto.randomUUID();
      socket.ws.send(
        JSON.stringify({
          type: "host:transfer",
          targetUserId: actor.sub === A.sub ? B.sub : A.sub,
          expectedHostRevision: 999,
          operationId,
        }),
      );
      expect(await socket.next()).toMatchObject({
        type: "error",
        code: "forbidden",
        operationId,
      });
      expect(
        await runInRoomDO(roomId, (_, state) =>
          state.storage.sql.exec("SELECT * FROM room_owner").toArray(),
        ),
      ).toEqual(before);
      expect(await room.getPhase()).toEqual({ kind: "lobby" });
      socket.ws.send(
        JSON.stringify({ type: "start_phase", expectedHostRevision: 999 }),
      );
      expect(await socket.next()).toMatchObject({ type: "phase:updated" });
    },
  );
});
