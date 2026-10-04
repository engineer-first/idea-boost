import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

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
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
async function connect(user: typeof A, roomId: string) {
  const socket = await connectRoomAs(user, roomId);
  sockets.push(socket);
  const snapshot = await receive(socket, "snapshot");
  return { socket, snapshot };
}
async function setup() {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  await joinRoomAs(C, inviteCode);
  const { socket: a } = await connect(A, roomId);
  const { socket: b } = await connect(B, roomId);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  return { roomId, inviteCode, stub, a, b };
}
function send(socket: RoomSocket, message: unknown) {
  socket.ws.send(JSON.stringify(message));
}
async function receive<T extends ServerMessage["type"]>(
  socket: RoomSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  const message = await socket.next();
  expect(message.type).toBe(type);
  return message as Extract<ServerMessage, { type: T }>;
}
function remove(
  socket: RoomSocket,
  targetUserId = B.sub,
  expectedHostRevision = 0,
) {
  const operationId = crypto.randomUUID();
  send(socket, {
    type: "member:remove",
    targetUserId,
    expectedHostRevision,
    operationId,
  });
  return operationId;
}
async function removeAccepted(
  socket: RoomSocket,
  targetUserId = B.sub,
  expectedHostRevision = 0,
) {
  const operationId = remove(socket, targetUserId, expectedHostRevision);
  expect(await receive(socket, "member_left")).toMatchObject({
    userId: targetUserId,
  });
  expect(await receive(socket, "member:removed")).toEqual({
    type: "member:removed",
    targetUserId,
    operationId,
  });
}

describe("ホストによるメンバー除外", () => {
  it("非ホストは他者を外せず操作ID付きで拒否する", async () => {
    const { a, b, stub } = await setup();
    const operationId = remove(b, C.sub);
    expect(await receive(b, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
    expect(await stub.isMember(C.sub)).toBe(true);
    expect(await stub.isMember(A.sub)).toBe(true);
    a.close();
  });
  it.each([
    A.sub,
    OUTSIDER,
  ])("自己または非メンバー %s を拒否する", async (target) => {
    const { a, stub } = await setup();
    const operationId = remove(a, target);
    expect(await receive(a, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
    expect(await stub.isMember(A.sub)).toBe(true);
  });
  it("未接続のメンバーを外し、他メンバーへ退出・送信者へ完了を順に返す", async () => {
    const { a, b, stub } = await setup();
    await removeAccepted(a, C.sub);
    expect(await receive(b, "member_left")).toMatchObject({ userId: C.sub });
    expect(await stub.isMember(C.sub)).toBe(false);
    const operationId = remove(a, C.sub);
    expect(await receive(a, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
  });
  it("外された人の全タブを既存退出コード4000で閉じ、再接続も拒否する", async () => {
    const { roomId, a, b, stub } = await setup();
    const { socket: b2 } = await connect(B, roomId);
    const closes = [b, b2].map(
      (socket) =>
        new Promise<number>((resolve) =>
          socket.ws.addEventListener("close", (event) => resolve(event.code), {
            once: true,
          }),
        ),
    );
    await removeAccepted(a);
    expect(await Promise.all(closes)).toEqual([4000, 4000]);
    expect(await stub.isMember(B.sub)).toBe(false);
    const response = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      { headers: { Upgrade: "websocket", Cookie: await sessionCookieFor(B) } },
    );
    expect(response.status).toBe(404);
  });
  it("ホスト移譲後は古いホストと古い世代の除外を拒否する", async () => {
    const { a, b, stub } = await setup();
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    await receive(a, "host:updated");
    await receive(b, "host:updated");
    for (const [socket, revision] of [
      [a, 0],
      [b, 0],
    ] as const) {
      const operationId = remove(socket, C.sub, revision);
      expect(await receive(socket, "error")).toMatchObject({
        code: "forbidden",
        operationId,
      });
    }
    expect(await stub.isMember(C.sub)).toBe(true);
    await removeAccepted(b, C.sub, 1);
    await receive(a, "member_left");
  });
  it("保存待ち遷移中は除外を拒否し、参加を維持する", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    send(a, {
      type: "phase:next",
      ...(await currentPhaseExpectation(roomId)),
      expectedHostRevision: 0,
    });
    await receive(a, "phase:save-requested");
    await receive(b, "phase:save-requested");
    const operationId = remove(a);
    expect(await receive(a, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
    expect(await stub.isMember(B.sub)).toBe(true);
  });
  it("完了したルームでは除外を拒否する", async () => {
    const { roomId, stub, a } = await setup();
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    const operationId = remove(a);
    expect(await receive(a, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
    // isMember RPC は完了後 false を返すため、SQLで会員行が残ることを検証する。
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        state.storage.sql
          .exec("SELECT user_id FROM members WHERE user_id=?1", B.sub)
          .toArray(),
      ),
    ).toHaveLength(1);
    expect(await stub.getCurrentHost()).toMatchObject({ hostUserId: A.sub });
  });
  it("進行中も除外でき、再招待で同じ色・付箋・票を復元する", async () => {
    const { roomId, inviteCode, a, b, stub } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    send(b, { type: "note:create", content: "再参加しても残る付箋" });
    const { note } = await receive(b, "note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, A.sub);
    send(b, { type: "note:publish", noteId: note.id, x: 30, y: 40 });
    await receive(a, "note:inserted");
    await receive(b, "note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 4 }, A.sub);
    send(b, { type: "note:vote", noteId: note.id, kind: "subjective" });
    await receive(b, "note:updated");
    const before = await runInRoomDO(roomId, (_room, state) => ({
      notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
      votes: state.storage.sql
        .exec("SELECT * FROM note_vote_stickers")
        .toArray(),
      colors: state.storage.sql
        .exec("SELECT * FROM member_color_assignments")
        .toArray(),
    }));
    await removeAccepted(a);
    await joinRoomAs(B, inviteCode);
    await receive(a, "member_joined");
    const { snapshot } = await connect(B, roomId);
    expect(
      snapshot.members.find((member) => member.userId === B.sub)?.color,
    ).toBe(note.color);
    expect(snapshot.notes[0]).toMatchObject({
      id: note.id,
      content: note.content,
      dotVotes: { subjective: { ownCount: 1 } },
    });
    expect(
      await runInRoomDO(roomId, (_room, state) => ({
        notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
        votes: state.storage.sql
          .exec("SELECT * FROM note_vote_stickers")
          .toArray(),
        colors: state.storage.sql
          .exec("SELECT * FROM member_color_assignments")
          .toArray(),
      })),
    ).toEqual(before);
  });
  it("外された古いソケットは再参加後も操作できず共有情報を受け取らない", async () => {
    const { roomId, stub } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    await runInRoomDO(roomId, async (room, state) => {
      const active = state.getWebSockets();
      const old = active.find(
        (socket) => socket.deserializeAttachment()?.userId === B.sub,
      );
      const host = active.find(
        (socket) => socket.deserializeAttachment()?.userId === A.sub,
      );
      if (!old || !host) throw new Error("接続が見つかりません");
      await room.webSocketMessage(
        host,
        JSON.stringify({
          type: "member:remove",
          targetUserId: B.sub,
          expectedHostRevision: 0,
          operationId: crypto.randomUUID(),
        }),
      );
      const sent = vi.spyOn(old, "send");
      await room.webSocketMessage(
        old,
        JSON.stringify({ type: "note:create", content: "除外後の不正な付箋" }),
      );
      expect(state.storage.sql.exec("SELECT * FROM notes").toArray()).toEqual(
        [],
      );
      room.upsertMember(B.sub, B.name);
      await room.webSocketMessage(
        old,
        JSON.stringify({
          type: "note:create",
          content: "再参加後も古い接続は無効",
        }),
      );
      expect(state.storage.sql.exec("SELECT * FROM notes").toArray()).toEqual(
        [],
      );
      await room.webSocketMessage(
        host,
        JSON.stringify({
          type: "timer:start",
          durationMs: 60_000,
          expectedHostRevision: 0,
        }),
      );
      expect(sent).not.toHaveBeenCalled();
      sent.mockRestore();
    });
  });

  it("除外時にドラッグ権とカーソルを解放し、残った人が同じ付箋を動かせる", async () => {
    const { roomId, a, b, stub } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    send(b, { type: "note:create", content: "移動途中の付箋" });
    const { note } = await receive(b, "note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, A.sub);
    send(b, { type: "note:publish", noteId: note.id, x: 30, y: 40 });
    await receive(a, "note:inserted");
    await receive(b, "note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 3 }, A.sub);
    send(b, {
      type: "note:drag:start",
      noteId: note.id,
      dragId: crypto.randomUUID(),
    });
    await receive(b, "note:drag:result");
    send(b, { type: "cursor:update", x: 30, y: 40, draggingNoteId: note.id });
    await receive(a, "cursor:updated");
    const operationId = remove(a);
    await receive(a, "member_left");
    await receive(a, "note:updated");
    expect(await receive(a, "cursor:left")).toMatchObject({ userId: B.sub });
    expect(await receive(a, "member:removed")).toMatchObject({ operationId });
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        state
          .getWebSockets()
          .some((socket) =>
            Boolean(socket.deserializeAttachment()?.activeDrag),
          ),
      ),
    ).toBe(false);
    send(a, {
      type: "note:drag:start",
      noteId: note.id,
      dragId: crypto.randomUUID(),
    });
    expect(await receive(a, "note:drag:result")).toMatchObject({
      accepted: true,
    });
  });
});
