import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";
import { resetSharingForPhase } from "./sharing-state";

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
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
async function setup() {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  const a = await connectRoomAs(A, roomId);
  sockets.push(a);
  await a.next();
  const b = await connectRoomAs(B, roomId);
  sockets.push(b);
  await b.next();
  return {
    roomId,
    inviteCode,
    a,
    b,
    stub: env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)),
  };
}
function rename(socket: RoomSocket, name: string, extra = {}) {
  const operationId = crypto.randomUUID();
  socket.ws.send(
    JSON.stringify({ type: "member:rename", name, operationId, ...extra }),
  );
  return operationId;
}
async function memberNames(roomId: string) {
  return runInRoomDO(roomId, (_room, state) =>
    state.storage.sql
      .exec("SELECT user_id,name,color FROM members ORDER BY user_id")
      .toArray(),
  );
}
describe("ルーム内の呼び名", () => {
  it("現在の発表順だけ更新し、付箋・票・作者・色と保全済み成果や履歴は再編集しない", async () => {
    const { roomId, a, b, stub } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    a.ws.send(JSON.stringify({ type: "note:create", content: "本文を保つ" }));
    const created = await a.next();
    expect(created.type).toBe("note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, A.sub);
    await runInRoomDO(roomId, (_room, state) =>
      resetSharingForPhase(state.storage.sql, {
        kind: "step",
        phase: 1,
        step: 2,
      }),
    );
    const before = await runInRoomDO(roomId, (_room, state) => ({
      notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
      votes: state.storage.sql
        .exec("SELECT * FROM note_vote_stickers")
        .toArray(),
      outcomes: state.storage.sql
        .exec("SELECT * FROM shared_outcome_state")
        .toArray(),
      history: state.storage.sql
        .exec("SELECT * FROM progress_history_outbox")
        .toArray(),
      sharing: JSON.parse(
        String(
          state.storage.sql.exec("SELECT state_json FROM sharing_state").one()
            .state_json,
        ),
      ),
    }));
    rename(a, "現在の呼び名");
    expect(await a.next()).toMatchObject({ type: "member:renamed" });
    await b.next();
    const after = await runInRoomDO(roomId, (_room, state) => ({
      notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
      votes: state.storage.sql
        .exec("SELECT * FROM note_vote_stickers")
        .toArray(),
      outcomes: state.storage.sql
        .exec("SELECT * FROM shared_outcome_state")
        .toArray(),
      history: state.storage.sql
        .exec("SELECT * FROM progress_history_outbox")
        .toArray(),
      sharing: JSON.parse(
        String(
          state.storage.sql.exec("SELECT state_json FROM sharing_state").one()
            .state_json,
        ),
      ),
    }));
    expect(after).toEqual({
      ...before,
      sharing: {
        ...before.sharing,
        order: before.sharing.order.map((member: { userId: string }) =>
          member.userId === A.sub
            ? { ...member, name: "現在の呼び名" }
            : member,
        ),
      },
    });
  });
  it("ルームの削除と期限切れで呼び名の上書きも削除する", async () => {
    for (const expiry of [false, true]) {
      const { roomId, a, stub } = await setup();
      rename(a, "期限付き");
      expect(await a.next()).toMatchObject({ type: "member:renamed" });
      if (expiry)
        await runInRoomDO(roomId, async (room, state) => {
          state.storage.sql.exec(
            "UPDATE shared_outcome_state SET expires_at=? WHERE id=1",
            Date.now() - 1,
          );
          await room.alarm();
        });
      else await stub.disband(A.sub);
      expect(
        await runInRoomDO(roomId, (_room, state) =>
          state.storage.sql
            .exec("SELECT * FROM member_display_names")
            .toArray(),
        ),
      ).toEqual([]);
    }
  });

  it("他人を指定する入力を拒否し、本人の空欄・空白・長すぎる入力も保存しない", async () => {
    const { roomId, a } = await setup();
    const before = await memberNames(roomId);
    for (const [name, extra] of [
      ["別人", { targetUserId: B.sub }],
      ["", {}],
      ["　 ", {}],
      ["あ".repeat(41), {}],
    ] as const) {
      rename(a, name, extra);
      expect(await a.next()).toMatchObject({
        type: "error",
        code: "invalid-message",
      });
      expect(await memberNames(roomId)).toEqual(before);
    }
  });
  it("完了済みでは拒否し名前を維持する", async () => {
    const { roomId, a } = await setup();
    const before = await memberNames(roomId);
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    const operationId = rename(a, "変更禁止");
    expect(await a.next()).toMatchObject({
      type: "error",
      code: "forbidden",
      operationId,
    });
    expect(await memberNames(roomId)).toEqual(before);
  });
  it("在籍していない古い接続と未認証の接続を拒否する", async () => {
    const { roomId } = await setup();
    await runInRoomDO(roomId, async (room, state) => {
      const ws = state
        .getWebSockets()
        .find((ws) => ws.deserializeAttachment()?.userId === B.sub);
      if (!ws) throw new Error("接続がない");
      state.storage.sql.exec("DELETE FROM members WHERE user_id=?", B.sub);
      const sent = vi.spyOn(ws, "send");
      await room.webSocketMessage(
        ws,
        JSON.stringify({
          type: "member:rename",
          name: "幽霊",
          operationId: crypto.randomUUID(),
        }),
      );
      expect(sent).toHaveBeenCalledWith(expect.stringContaining('"forbidden"'));
      expect(
        state.storage.sql
          .exec("SELECT name FROM members WHERE user_id=?", B.sub)
          .toArray(),
      ).toEqual([]);
      sent.mockRestore();
    });
    expect(
      (
        await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
          headers: { Upgrade: "websocket" },
        })
      ).status,
    ).toBe(401);
  });
  it("本人の変更を全端末へ返し、再接続・認証名による再参加・退出後の再参加でも保持し別室に持ち越さない", async () => {
    const { roomId, inviteCode, a, b, stub } = await setup();
    const a2 = await connectRoomAs(A, roomId);
    sockets.push(a2);
    await a2.next();
    const before = await memberNames(roomId);
    const operationId = rename(a, "  はな  ");
    for (const socket of [a, a2, b])
      expect(await socket.next()).toMatchObject({
        type: "member:renamed",
        member: { userId: A.sub, name: "はな", color: before[0].color },
        operationId,
      });
    await joinRoomAs({ ...A, name: "新しいGoogle名" }, inviteCode);
    expect((await memberNames(roomId))[0].name).toBe("はな");
    const reconnect = await connectRoomAs(A, roomId);
    sockets.push(reconnect);
    expect(await reconnect.next()).toMatchObject({
      type: "snapshot",
      members: expect.arrayContaining([
        expect.objectContaining({ userId: A.sub, name: "はな" }),
      ]),
    });
    await stub.leave(B.sub, "discard");
    await a.next();
    await a2.next();
    await reconnect.next();
    await joinRoomAs(B, inviteCode);
    await a.next();
    await a2.next();
    await reconnect.next();
    const b2 = await connectRoomAs(B, roomId);
    sockets.push(b2);
    await b2.next();
    rename(b2, "はな");
    for (const socket of [a, a2, reconnect, b2])
      expect(await socket.next()).toMatchObject({
        type: "member:renamed",
        member: { userId: B.sub, name: "はな" },
      });
    await stub.leave(B.sub, "discard");
    await a.next();
    await a2.next();
    await reconnect.next();
    await joinRoomAs(B, inviteCode);
    expect((await memberNames(roomId))[1]).toMatchObject({
      name: "はな",
      color: before[1].color,
    });
    const other = await createRoomAs(B);
    expect((await memberNames(other.roomId))[0].name).toBe(B.name);
    expect(
      (
        await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
          headers: { Cookie: await sessionCookieFor(A) },
        })
      ).status,
    ).toBe(200);
  });
});
