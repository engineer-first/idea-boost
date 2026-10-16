import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
} from "../test-helpers";

const HOST = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "host@test.example",
  name: "Host",
};
const MEMBER = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "member@test.example",
  name: "Member",
};

const sockets: RoomSocket[] = [];

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

async function connectRoom() {
  const { roomId, inviteCode } = await createRoomAs(HOST);
  await joinRoomAs(MEMBER, inviteCode);
  const host = await connectRoomAs(HOST, roomId);
  const member = await connectRoomAs(MEMBER, roomId);
  sockets.push(host, member);
  expect((await host.next()).type).toBe("snapshot");
  expect((await member.next()).type).toBe("snapshot");
  return { roomId, host, member };
}

describe("共同操作の認可", () => {
  it("ホストでない参加者もルームを開始できる", async () => {
    const { member, host } = await connectRoom();

    member.ws.send(JSON.stringify({ type: "start_phase" }));

    expect(await member.next()).toMatchObject({
      type: "phase:updated",
      phase: { kind: "step", phase: 1, step: 1 },
    });
    expect(await host.next()).toMatchObject({
      type: "phase:updated",
      phase: { kind: "step", phase: 1, step: 1 },
    });
  });

  it("ホストでない参加者もタイマーを操作できる", async () => {
    const { roomId, member, host } = await connectRoom();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, HOST.sub);

    member.ws.send(JSON.stringify({ type: "timer:start", durationMs: 60_000 }));

    expect(await member.next()).toMatchObject({
      type: "timer:updated",
      timer: { status: "running", durationMs: 60_000 },
    });
    expect(await host.next()).toMatchObject({
      type: "timer:updated",
      timer: { status: "running", durationMs: 60_000 },
    });
  });
});
