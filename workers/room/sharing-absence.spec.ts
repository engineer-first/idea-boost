import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ServerMessage,
  SharingState,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { listMembers } from "./members";
import { saveSharingState } from "./sharing-state";
import { getTimerState } from "./timer";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "Ken Mori",
};
const B = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@test.example",
  name: "Hana Sato",
};
const C = {
  sub: "33333333-3333-4333-8333-333333333333",
  email: "c@test.example",
  name: "Yui Ito",
};
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

async function until<T extends ServerMessage["type"]>(
  socket: RoomSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  for (;;) {
    const message = await socket.next();
    if (message.type === type)
      return message as Extract<ServerMessage, { type: T }>;
  }
}

// 発表順と現在の発表者を固定し、計時中の共有ターンを用意する。
async function setup(
  orderIds: string[],
  currentIndex: number,
  results: SharingState["results"] = [],
) {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  await joinRoomAs(C, inviteCode);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase({ kind: "step", phase: 1, step: 2 }, A.sub);
  await runInRoomDO(roomId, (_room, state) => {
    const members = listMembers(state.storage.sql);
    saveSharingState(state.storage.sql, {
      revision: crypto.randomUUID(),
      order: orderIds.map((id) => {
        const member = members.find((entry) => entry.userId === id);
        if (!member) throw new Error("発表順の参加者が在籍していません。");
        return member;
      }),
      status: "active",
      currentIndex,
      results,
      durationMs: 180000,
      startsAt: null,
    });
  });
  await startTimerForTest(roomId);
  const a = await connectRoomAs(A, roomId);
  sockets.push(a);
  const snapshot = await until(a, "snapshot");
  if (!snapshot.sharing) throw new Error("共有状態がない");
  return { roomId, stub, a, sharing: snapshot.sharing };
}

function removeMember(socket: RoomSocket, targetUserId: string) {
  socket.ws.send(
    JSON.stringify({
      type: "member:remove",
      targetUserId,
      operationId: crypto.randomUUID(),
    }),
  );
}

describe("発表中の参加者の退出と除外", () => {
  it("発表中の参加者を外すとパスとして記録し、次の参加者へ交代する", async () => {
    const { a } = await setup([B.sub, A.sub, C.sub], 0);
    removeMember(a, B.sub);
    const { sharing, timer } = await until(a, "sharing:updated");
    expect(sharing).toMatchObject({
      status: "active",
      currentIndex: 1,
      results: ["passed"],
    });
    expect(sharing.startsAt).not.toBeNull();
    expect(timer).toEqual({ status: "idle" });
  });

  it("発表中の参加者が自分で退出しても次の参加者へ交代する", async () => {
    const { roomId, stub } = await setup([B.sub, A.sub, C.sub], 0);
    await stub.leave(B.sub);
    const snapshot = await connectRoomAs(A, roomId);
    sockets.push(snapshot);
    expect((await until(snapshot, "snapshot")).sharing).toMatchObject({
      currentIndex: 1,
      results: ["passed"],
    });
  });

  it("最後の発表者を外すと共有を完了する", async () => {
    const { a } = await setup([A.sub, C.sub, B.sub], 2, ["done", "done"]);
    removeMember(a, B.sub);
    expect((await until(a, "sharing:updated")).sharing).toMatchObject({
      status: "complete",
      currentIndex: null,
      results: ["done", "done", "passed"],
    });
  });

  it("発表前に退出した参加者の番は自動でパスとして飛ばす", async () => {
    const { a, sharing } = await setup([A.sub, B.sub, C.sub], 0);
    removeMember(a, B.sub);
    await until(a, "member:removed");
    a.ws.send(
      JSON.stringify({
        type: "sharing:advance",
        outcome: "done",
        revision: sharing.revision,
      }),
    );
    expect((await until(a, "sharing:updated")).sharing).toMatchObject({
      status: "active",
      currentIndex: 2,
      results: ["done", "passed"],
    });
  });
});

describe("発表者のパス", () => {
  it("参加者は計時中でも今の発表者をパスできる", async () => {
    const { a, roomId, sharing } = await setup([B.sub, A.sub, C.sub], 0);
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        getTimerState(state.storage.sql),
      ),
    ).toMatchObject({ status: "running" });
    a.ws.send(
      JSON.stringify({
        type: "sharing:advance",
        outcome: "passed",
        revision: sharing.revision,
      }),
    );
    expect((await until(a, "sharing:updated")).sharing).toMatchObject({
      currentIndex: 1,
      results: ["passed"],
    });
  });
});
