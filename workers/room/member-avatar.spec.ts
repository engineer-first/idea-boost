import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEMBER_AVATAR_IDS,
  type MemberAvatarId,
} from "../../contracts/member-avatar";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  type TestUser,
} from "../test-helpers";
import { RoomBroadcaster } from "./broadcast";
import { memberAvatarHandlers } from "./member-avatar-handlers";

const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
function guest(name: string): TestUser {
  return { sub: crypto.randomUUID(), kind: "guest", email: null, name };
}
async function setup() {
  const owner = guest("はな");
  const peer = guest("たろう");
  const { roomId, inviteCode } = await createRoomAs(owner);
  await joinRoomAs(peer, inviteCode);
  const a = await connectRoomAs(owner, roomId);
  const b = await connectRoomAs(peer, roomId);
  sockets.push(a, b);
  const initial = await a.next();
  await b.next();
  return {
    roomId,
    inviteCode,
    owner,
    peer,
    a,
    b,
    initial,
    stub: env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)),
  };
}
function change(socket: RoomSocket, extra: Record<string, unknown> = {}) {
  const operationId = crypto.randomUUID();
  socket.ws.send(
    JSON.stringify({ type: "member:cycle-avatar", operationId, ...extra }),
  );
  return operationId;
}

function nextFace(avatarId: MemberAvatarId): MemberAvatarId {
  return MEMBER_AVATAR_IDS[
    (MEMBER_AVATAR_IDS.indexOf(avatarId) + 1) % MEMBER_AVATAR_IDS.length
  ];
}

async function responseFor(socket: RoomSocket, type: string) {
  for (let i = 0; i < 100; i++) {
    const message = await socket.next();
    if (message.type === type || message.type === "error") return message;
  }
  throw new Error("顔アイコンの応答がありませんでした。");
}

describe("ルーム単位の顔アイコン", () => {
  it("ゲスト20人に20種類を割り当て、21人目を受け入れない", async () => {
    const { stub } = await setup();
    for (let i = 2; i < 20; i++)
      expect(
        await stub.upsertMember(crypto.randomUUID(), `参加者${i}`),
      ).toEqual({ ok: true });
    const members = await stub.listMembers();
    expect(members).toHaveLength(20);
    for (const member of members)
      expect(member).toMatchObject({
        avatarId: expect.stringMatching(/^face-(0[1-9]|1[0-9]|20)$/),
      });
    expect(new Set(members.map((member) => member.avatarId)).size).toBe(20);
    expect(await stub.upsertMember(crypto.randomUUID(), "21人目")).toEqual({
      ok: false,
      reason: "room-full",
    });
  });

  it("待機中の本人の顔だけを次の顔へ変え、同じ色のまま全員へ確定通知する", async () => {
    const { stub, a, b, owner, peer, initial } = await setup();
    expect(initial).toMatchObject({ type: "snapshot" });
    expect(initial).not.toHaveProperty("availableAvatarCount");
    const before = await stub.listMembers();
    const operationId = change(a);
    const result = await a.next();
    expect(result).toMatchObject({
      type: "member:avatar-updated",
      operationId,
    });
    expect(result).not.toHaveProperty("availableAvatarCount");
    expect(await b.next()).toEqual(result);
    const after = await stub.listMembers();
    expect(after.find((m) => m.userId === peer.sub)).toEqual(
      before.find((m) => m.userId === peer.sub),
    );
    const oldSelf = before.find((m) => m.userId === owner.sub);
    const newSelf = after.find((m) => m.userId === owner.sub);
    expect(newSelf?.avatarId).toBe(
      nextFace(oldSelf?.avatarId as MemberAvatarId),
    );
    expect(newSelf).toMatchObject({
      userId: owner.sub,
      name: oldSelf?.name,
      color: oldSelf?.color,
    });
  });

  it("最後の顔から先頭の顔へ巡回する", async () => {
    const { roomId, a, owner } = await setup();
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE member_avatar_assignments SET avatar_id='face-20' WHERE user_id=?",
        owner.sub,
      ),
    );
    change(a);
    expect(await a.next()).toMatchObject({
      type: "member:avatar-updated",
      member: { userId: owner.sub, avatarId: "face-01" },
    });
  });

  it("他人や顔の指定を拒否し、進行開始後も変更を受け付けない", async () => {
    const { stub, a, owner, peer } = await setup();
    const before = await stub.listMembers();
    for (const extra of [{ userId: peer.sub }, { avatarId: "face-01" }]) {
      change(a, extra);
      expect(await a.next()).toMatchObject({
        type: "error",
        code: "invalid-message",
      });
      expect(await stub.listMembers()).toEqual(before);
    }
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, owner.sub);
    const operationId = change(a);
    for (let i = 0; i < 10; i++) {
      const response = await a.next();
      if (response.type === "error") {
        expect(response).toMatchObject({ code: "forbidden", operationId });
        break;
      }
      expect(i).toBeLessThan(9);
    }
    expect(await stub.listMembers()).toEqual(before);
  });

  it("20人分が割当済みでも順繰りに変更でき、同じ顔を重複して使える", async () => {
    const { stub, a, owner } = await setup();
    for (let i = 2; i < 20; i++)
      await stub.upsertMember(crypto.randomUUID(), `参加者${i}`);
    const before = await stub.listMembers();
    const oldSelf = before.find((m) => m.userId === owner.sub);
    change(a);
    expect(await responseFor(a, "member:avatar-updated")).toMatchObject({
      type: "member:avatar-updated",
      member: {
        userId: owner.sub,
        avatarId: nextFace(oldSelf?.avatarId as MemberAvatarId),
      },
    });
    const after = await stub.listMembers();
    expect(after.filter((m) => m.userId !== owner.sub)).toEqual(
      before.filter((m) => m.userId !== owner.sub),
    );
    // 20人が割当済みなので、次の顔は他の参加者と同じになる。
    expect(new Set(after.map((m) => m.avatarId)).size).toBe(19);
  });

  it("退出者の顔も予約し、同じ本人の再参加で元の顔と色を戻す", async () => {
    const { stub, a, peer, inviteCode } = await setup();
    const original = (await stub.listMembers()).find(
      (m) => m.userId === peer.sub,
    );
    expect(original).toMatchObject({ avatarId: expect.any(String) });
    await stub.leave(peer.sub);
    for (let i = 0; i < 10; i++) {
      change(a);
      await responseFor(a, "member:avatar-updated");
    }
    expect((await stub.listMembers())[0].avatarId).not.toBe(original?.avatarId);
    await joinRoomAs(peer, inviteCode);
    expect(
      (await stub.listMembers()).find((m) => m.userId === peer.sub),
    ).toEqual(original);
  });

  it("除外後のソケットは顔を変更できない", async () => {
    const { roomId, stub, a, owner } = await setup();
    const before = await stub.listMembers();
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec("DELETE FROM members WHERE user_id=?", owner.sub),
    );
    const operationId = change(a);
    expect(await a.next()).toMatchObject({
      type: "error",
      code: "forbidden",
      operationId,
    });
    const remaining = await stub.listMembers();
    expect(remaining).toEqual(before.filter((m) => m.userId !== owner.sub));
  });
});

it("変更直前に認可が失効した要求は顔を更新しない", async () => {
  const { roomId, stub, owner } = await setup();
  const before = await stub.listMembers();
  await runInRoomDO(roomId, (_room, state) => {
    const reply = vi.fn();
    const pair = new WebSocketPair();
    memberAvatarHandlers["member:cycle-avatar"](
      {
        sql: state.storage.sql,
        storage: state.storage,
        userId: owner.sub,
        ws: pair[1],
        reply,
        broadcaster: new RoomBroadcaster(state),
        authorizeMutation: () => false,
        refreshSnapshots() {},
      },
      { type: "member:cycle-avatar", operationId: crypto.randomUUID() },
    );
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", code: "forbidden" }),
    );
  });
  expect(await stub.listMembers()).toEqual(before);
});

it("同時に2人が変更しても、それぞれ次の顔へ進む", async () => {
  const { stub, a, b } = await setup();
  const before = await stub.listMembers();
  const operations = [change(a), change(b)];
  await Promise.all(
    [a, b].map(async (socket, index) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const message = await socket.next();
        if (
          message.type === "member:avatar-updated" &&
          message.operationId === operations[index]
        )
          return;
        expect(attempt).toBeLessThan(9);
      }
    }),
  );
  const members = await stub.listMembers();
  for (const previous of before)
    expect(
      members.find((member) => member.userId === previous.userId)?.avatarId,
    ).toBe(nextFace(previous.avatarId as MemberAvatarId));
});

it("退出者を含め20種類を確保済みでも、在籍者は変更できて重複を許す", async () => {
  const { stub, peer, a, owner } = await setup();
  await stub.leave(peer.sub);
  for (let i = 2; i < 20; i++)
    await stub.upsertMember(crypto.randomUUID(), `参加者${i}`);
  expect(await stub.listMembers()).toHaveLength(19);
  const before = await stub.listMembers();
  const oldSelf = before.find((m) => m.userId === owner.sub);
  const operationId = change(a);
  expect(await responseFor(a, "member:avatar-updated")).toMatchObject({
    type: "member:avatar-updated",
    operationId,
    member: {
      userId: owner.sub,
      avatarId: nextFace(oldSelf?.avatarId as MemberAvatarId),
    },
  });
  expect(await stub.listMembers()).not.toEqual(before);
});

it("通信切断では一覧と顔を保持し、別タブが残る間は接続中のままにする", async () => {
  const { roomId, stub, a, b, peer } = await setup();
  const original = (await stub.listMembers()).find(
    (m) => m.userId === peer.sub,
  );
  const second = await connectRoomAs(peer, roomId);
  sockets.push(second);
  await second.next();
  b.close();
  const connected = () =>
    runInRoomDO(roomId, (_room, state) =>
      new RoomBroadcaster(state).connectedUserIds(() => true),
    );
  expect(await connected()).toContain(peer.sub);
  second.close();
  await vi.waitFor(async () =>
    expect(await connected()).not.toContain(peer.sub),
  );
  expect((await stub.listMembers()).find((m) => m.userId === peer.sub)).toEqual(
    original,
  );
  const reconnect = await connectRoomAs(peer, roomId);
  sockets.push(reconnect);
  expect(await reconnect.next()).toMatchObject({
    type: "snapshot",
    members: expect.arrayContaining([original]),
  });
  expect(await connected()).toContain(peer.sub);
  a.close();
});
