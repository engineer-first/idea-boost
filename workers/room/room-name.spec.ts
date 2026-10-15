import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueCreationId } from "../../contracts/room-creation";
import { handleSharedOutcomes } from "../shared-outcomes-api";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "ホスト",
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
async function connect(user: typeof A, roomId: string) {
  const socket = await connectRoomAs(user, roomId);
  sockets.push(socket);
  return { socket, snapshot: await socket.next() };
}
async function setup() {
  const room = await createRoomAs(A);
  await joinRoomAs(B, room.inviteCode);
  const a = (await connect(A, room.roomId)).socket;
  const b = (await connect(B, room.roomId)).socket;
  return {
    ...room,
    a,
    b,
    stub: env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)),
  };
}
function rename(socket: RoomSocket, name: string, extra = {}) {
  const operationId = crypto.randomUUID();
  socket.ws.send(
    JSON.stringify({ type: "room:rename", name, operationId, ...extra }),
  );
  return operationId;
}
async function identity(roomId: string) {
  return runInRoomDO(roomId, (_room, state) =>
    state.storage.sql.exec("SELECT * FROM shared_outcome_identity").one(),
  );
}
describe("ルーム名の変更", () => {
  it("完了後は保存せず、操作ID付きで拒否する", async () => {
    const { roomId, b } = await setup();
    const before = await identity(roomId);
    await runInRoomDO(roomId, (_room, state) => {
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      );
    });
    const operationId = rename(b, "J05");
    expect(await b.next()).toMatchObject({
      type: "error",
      code: "forbidden",
      operationId,
    });
    expect(await identity(roomId)).toEqual(before);
  });
  it("未認証・非メンバーの接続を拒否する", async () => {
    const { roomId } = await setup();
    for (const cookie of [
      undefined,
      await sessionCookieFor({
        ...B,
        sub: "33333333-3333-4333-8333-333333333333",
      }),
    ]) {
      const response = await SELF.fetch(
        `https://api.test/api/rooms/${roomId}/ws`,
        {
          headers: {
            Upgrade: "websocket",
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
      );
      expect(response.status).toBe(cookie ? 404 : 401);
    }
  });
  it.each([
    false,
    true,
  ])("退出済みソケットの遅延要求・期限切れを拒否する expired=%s", async (expired) => {
    const { roomId, b } = await setup();
    const before = await identity(roomId);
    await runInRoomDO(roomId, (_room, state) => {
      if (expired)
        state.storage.sql.exec(
          "UPDATE shared_outcome_state SET expires_at=? WHERE id=1",
          Date.now() - 1,
        );
      else state.storage.sql.exec("DELETE FROM members WHERE user_id=?", B.sub);
    });
    const operationId = rename(b, "J05");
    expect(await b.next()).toMatchObject({
      type: "error",
      code: "forbidden",
      operationId,
    });
    expect(await identity(roomId)).toEqual(before);
  });
  it("空欄・文字数超過・別ルーム指定を拒否して保存しない", async () => {
    const { roomId, b } = await setup();
    const before = await identity(roomId);
    for (const [name, extra] of [
      ["　 ", {}],
      ["あ".repeat(16), {}],
      ["J05", { roomId: crypto.randomUUID() }],
    ] as const) {
      rename(b, name, extra);
      expect(await b.next()).toMatchObject({
        type: "error",
        code: "invalid-message",
      });
      expect(await identity(roomId)).toEqual(before);
    }
  });
  it("ホストも参加者も待機中・活動中に変更でき、全員と再接続先に反映する", async () => {
    const { roomId, inviteCode, a, b, stub } = await setup();
    for (const [socket, name] of [
      [a, "J04"],
      [b, "J05"],
    ] as const) {
      const before = await runInRoomDO(roomId, (_room, state) => ({
        members: state.storage.sql.exec("SELECT * FROM members").toArray(),
        notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
        phase: state.storage.sql.exec("SELECT phase FROM room_state").one(),
      }));
      const operationId = rename(socket, ` ${name} `);
      for (const peer of [a, b])
        expect(await peer.next()).toMatchObject({
          type: "room:renamed",
          name,
          operationId,
        });
      expect((await connect(B, roomId)).snapshot).toMatchObject({
        type: "snapshot",
        roomName: name,
      });
      expect(
        await runInRoomDO(roomId, (_room, state) => ({
          members: state.storage.sql.exec("SELECT * FROM members").toArray(),
          notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
          phase: state.storage.sql.exec("SELECT phase FROM room_state").one(),
        })),
      ).toEqual(before);
      const response = await SELF.fetch(
        `https://api.test/api/rooms/${roomId}`,
        { headers: { Cookie: await sessionCookieFor(B) } },
      );
      expect(await response.json()).toMatchObject({ inviteCode });
      expect(await stub.participationName(inviteCode)).toBe(name);
      const result = await handleSharedOutcomes(
        new Request(`https://api.test/api/shared-outcomes?q=${name}`),
        env,
      );
      expect(await result.json()).toMatchObject({
        outcomes: [expect.objectContaining({ roomId, name })],
      });
      if (name === "J04") {
        await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
      }
    }
  });
});

it("参加先確認の非同期待機中にセッション期限を越えた変更を保存しない", async () => {
  const { roomId } = await setup();
  const before = await identity(roomId);
  await runInRoomDO(roomId, async (instance, state) => {
    const socket = state
      .getWebSockets()
      .find((ws) => ws.deserializeAttachment().userId === B.sub);
    if (!socket) throw new Error("テスト用ソケットがありません");
    const expiry = Math.floor(Date.now() / 1000) + 60;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: expiry,
    });
    const runtime = instance as unknown as { env: Env };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const lookup = vi.spyOn(runtime.env.ACCOUNT_DO, "get").mockReturnValue({
      mayOperate: async () => {
        vi.setSystemTime(expiry * 1000);
        return true;
      },
    } as never);
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: "room:rename",
          name: "期限後の変更",
          operationId: crypto.randomUUID(),
        }),
      );
      expect(
        state.storage.sql.exec("SELECT * FROM shared_outcome_identity").one(),
      ).toEqual(before);
      expect(socket.readyState).not.toBe(WebSocket.OPEN);
    } finally {
      lookup.mockRestore();
      vi.useRealTimers();
    }
  });
});

it("16文字のルーム名では新規作成できない", async () => {
  const response = await SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(A),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: issueCreationId().requestId,
      expectedPrincipal: A.sub,
      name: "あ".repeat(16),
    }),
  });
  expect(response.status).toBe(400);
});
it("15文字の名前で作成し、15文字の別名にも変更できる", async () => {
  const name = "あ".repeat(15);
  const response = await SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(A),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: issueCreationId().requestId,
      expectedPrincipal: A.sub,
      name,
    }),
  });
  expect(response.status).toBe(200);
  const { roomId } = await response.json<{ roomId: string }>();
  const { socket, snapshot } = await connect(A, roomId);
  expect(snapshot).toMatchObject({ roomName: name });
  const nextName = "い".repeat(15);
  rename(socket, nextName);
  expect(await socket.next()).toMatchObject({
    type: "room:renamed",
    name: nextName,
  });
});
