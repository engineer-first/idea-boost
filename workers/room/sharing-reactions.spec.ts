import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { RoomPhase } from "../../contracts/phase";
import { parseServerMessage } from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "発表者",
  email: "host@example.test",
};
const listener = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "聞き手",
  email: "listener@example.test",
};

async function until(socket: RoomSocket, type: string) {
  for (;;) {
    const message = await socket.next();
    if (message.type === type) return message;
    if (message.type === "error") throw new Error(JSON.stringify(message));
  }
}

async function setup(phase: RoomPhase = { kind: "step", phase: 1, step: 2 }) {
  const { roomId, inviteCode } = await createRoomAs(host);
  await joinRoomAs(listener, inviteCode);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase(phase, host.sub);
  const owner = await connectRoomAs(host, roomId);
  await owner.next();
  const member = await connectRoomAs(listener, roomId);
  await member.next();
  const { expectedRevision } = await currentPhaseExpectation(roomId);
  return { roomId, owner, member, revision: expectedRevision };
}

describe("共有中のいいね", () => {
  it.each([
    { kind: "step", phase: 1, step: 1 },
    { kind: "step", phase: 1, step: 4 },
    { kind: "step", phase: 2, step: 3 },
    { kind: "step", phase: 3, step: 2 },
  ] as const)("対象外の工程 $phase-$step からは送れない", async (phase) => {
    const { owner, member, revision } = await setup(phase);
    try {
      member.ws.send(
        JSON.stringify({
          type: "reaction:send",
          kind: "like",
          phaseRevision: revision,
        }),
      );
      expect(await member.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
    } finally {
      owner.close();
      member.close();
    }
  });

  it("古い工程の送信を拒否する", async () => {
    const { owner, member, revision } = await setup();
    try {
      member.ws.send(
        JSON.stringify({
          type: "reaction:send",
          kind: "like",
          phaseRevision: revision + 1,
        }),
      );
      expect(await member.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
    } finally {
      owner.close();
      member.close();
    }
  });

  it("退出した接続は送信も受信もできない", async () => {
    const { roomId, owner, member, revision } = await setup();
    try {
      await runInRoomDO(roomId, (_, state) => {
        state.storage.sql.exec(
          "DELETE FROM members WHERE user_id=?",
          listener.sub,
        );
      });
      member.ws.send(
        JSON.stringify({
          type: "reaction:send",
          kind: "like",
          phaseRevision: revision,
        }),
      );
      expect(await member.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      owner.ws.send(
        JSON.stringify({
          type: "reaction:send",
          kind: "like",
          phaseRevision: revision,
        }),
      );
      await until(owner, "reaction:received");
      // 有効な送信の処理後に返信を要求し、退出した接続に配信されていないことを確かめる。
      member.ws.send(
        JSON.stringify({
          type: "reaction:send",
          kind: "invalid",
          phaseRevision: revision,
        }),
      );
      expect(await member.next()).toMatchObject({
        type: "error",
        code: "invalid-message",
      });
    } finally {
      owner.close();
      member.close();
    }
  });

  it("未認証・非メンバーはリアクション用の接続を持てない", async () => {
    const { roomId } = await createRoomAs(host);
    const requestHeaders: HeadersInit[] = [
      { Upgrade: "websocket" },
      { Upgrade: "websocket", Cookie: await sessionCookieFor(listener) },
    ];
    for (const headers of requestHeaders) {
      const response = await SELF.fetch(
        `https://api.test/api/rooms/${roomId}/ws`,
        { headers },
      );
      expect([401, 404]).toContain(response.status);
    }
  });

  it("同じアカウントの複数接続でも4件目は配信せず、3秒後に再び送れる", async () => {
    const { roomId, owner, member, revision } = await setup();
    const second = await connectRoomAs(listener, roomId);
    await second.next();
    try {
      await runInRoomDO(roomId, async (instance, state) => {
        const sockets = state.getWebSockets();
        const senders = sockets.filter(
          (ws) => ws.deserializeAttachment().userId === listener.sub,
        );
        const recipient = sockets.find(
          (ws) => ws.deserializeAttachment().userId === host.sub,
        );
        if (senders.length !== 2 || !recipient)
          throw new Error("テスト用ソケットがありません");
        const wire = vi.spyOn(recipient, "send");
        const count = () =>
          wire.mock.calls.filter(
            ([raw]) => parseServerMessage(raw)?.type === "reaction:received",
          ).length;
        const start = Date.now();
        vi.useFakeTimers({ toFake: ["Date"] });
        const send = (ws: WebSocket) =>
          instance.webSocketMessage(
            ws,
            JSON.stringify({
              type: "reaction:send",
              kind: "like",
              phaseRevision: revision,
            }),
          );
        try {
          for (let index = 0; index < 4; index++) {
            vi.setSystemTime(start + index * 400);
            await send(senders[index % 2]);
          }
          expect(count()).toBe(3);
          await send(recipient);
          expect(count()).toBe(4);
          vi.setSystemTime(start + 3_000);
          await send(senders[0]);
          expect(count()).toBe(5);
        } finally {
          wire.mockRestore();
          vi.useRealTimers();
        }
      });
    } finally {
      owner.close();
      member.close();
      second.close();
    }
  });

  it.each([
    {
      limit: "400ms間隔",
      sentAt: [0],
      reconnectAt: 100,
      availableAt: 400,
    },
    {
      limit: "同時3件",
      sentAt: [0, 400, 800],
      reconnectAt: 1_200,
      availableAt: 3_000,
    },
  ])("切断して再接続しても「$limit」の制限を維持する", async (scenario) => {
    const { roomId, owner, member, revision } = await setup();
    let reconnected: RoomSocket | undefined;
    try {
      const start = await runInRoomDO(roomId, async (instance, state) => {
        const sender = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === listener.sub);
        const recipient = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === host.sub);
        if (!sender || !recipient)
          throw new Error("テスト用ソケットがありません");
        const wire = vi.spyOn(recipient, "send");
        const start = Date.now();
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          for (const sentAt of scenario.sentAt) {
            vi.setSystemTime(start + sentAt);
            await instance.webSocketMessage(
              sender,
              JSON.stringify({
                type: "reaction:send",
                kind: "like",
                phaseRevision: revision,
              }),
            );
          }
          expect(
            wire.mock.calls.filter(
              ([raw]) => parseServerMessage(raw)?.type === "reaction:received",
            ),
          ).toHaveLength(scenario.sentAt.length);
          sender.close();
          return start;
        } finally {
          wire.mockRestore();
          vi.useRealTimers();
        }
      });
      member.close();
      await expect
        .poll(() =>
          runInRoomDO(
            roomId,
            (_, state) =>
              state
                .getWebSockets()
                .filter(
                  (ws) => ws.deserializeAttachment().userId === listener.sub,
                ).length,
          ),
        )
        .toBe(0);
      reconnected = await connectRoomAs(listener, roomId);
      await reconnected.next();
      await runInRoomDO(roomId, async (instance, state) => {
        const sender = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === listener.sub);
        const recipient = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === host.sub);
        if (!sender || !recipient)
          throw new Error("テスト用ソケットがありません");
        const wire = vi.spyOn(recipient, "send");
        const count = () =>
          wire.mock.calls.filter(
            ([raw]) => parseServerMessage(raw)?.type === "reaction:received",
          ).length;
        const send = () =>
          instance.webSocketMessage(
            sender,
            JSON.stringify({
              type: "reaction:send",
              kind: "like",
              phaseRevision: revision,
            }),
          );
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          vi.setSystemTime(start + scenario.reconnectAt);
          await send();
          expect(count()).toBe(0);
          vi.setSystemTime(start + scenario.availableAt);
          await send();
          expect(count()).toBe(1);
        } finally {
          wire.mockRestore();
          vi.useRealTimers();
        }
      });
    } finally {
      owner.close();
      member.close();
      reconnected?.close();
    }
  });

  it("工程変更で同時表示件数をリセットし、400msの送信間隔は維持する", async () => {
    const { roomId, owner, member, revision } = await setup();
    try {
      await runInRoomDO(roomId, async (instance, state) => {
        const sender = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === listener.sub);
        const recipient = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === host.sub);
        if (!sender || !recipient)
          throw new Error("テスト用ソケットがありません");
        const wire = vi.spyOn(recipient, "send");
        const count = () =>
          wire.mock.calls.filter(
            ([raw]) => parseServerMessage(raw)?.type === "reaction:received",
          ).length;
        const send = (phaseRevision: number) =>
          instance.webSocketMessage(
            sender,
            JSON.stringify({
              type: "reaction:send",
              kind: "like",
              phaseRevision,
            }),
          );
        const start = Date.now();
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          for (let index = 0; index < 3; index++) {
            vi.setSystemTime(start + index * 400);
            await send(revision);
          }
          expect(count()).toBe(3);
          await instance.setPhase(
            { kind: "step", phase: 2, step: 2 },
            host.sub,
          );
          const nextRevision = Number(
            state.storage.sql
              .exec("SELECT phase_revision FROM room_state WHERE id=1")
              .one().phase_revision,
          );
          vi.setSystemTime(start + 1_199);
          await send(nextRevision);
          expect(count()).toBe(3);
          vi.setSystemTime(start + 1_200);
          await send(nextRevision);
          expect(count()).toBe(4);
        } finally {
          wire.mockRestore();
          vi.useRealTimers();
        }
      });
    } finally {
      owner.close();
      member.close();
    }
  });

  it("参加先確認の非同期待機中にセッション期限を越えたいいねを配信しない", async () => {
    const { roomId, owner, member, revision } = await setup();
    try {
      await runInRoomDO(roomId, async (instance, state) => {
        const sender = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === listener.sub);
        const recipient = state
          .getWebSockets()
          .find((ws) => ws.deserializeAttachment().userId === host.sub);
        if (!sender || !recipient)
          throw new Error("テスト用ソケットがありません");
        const expiry = Math.floor(Date.now() / 1000) + 60;
        sender.serializeAttachment({
          ...sender.deserializeAttachment(),
          sessionExpiresAt: expiry,
        });
        const wire = vi.spyOn(recipient, "send");
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
            sender,
            JSON.stringify({
              type: "reaction:send",
              kind: "like",
              phaseRevision: revision,
            }),
          );
          expect(lookup).toHaveBeenCalledOnce();
          expect(
            wire.mock.calls.some(
              ([raw]) => parseServerMessage(raw)?.type === "reaction:received",
            ),
          ).toBe(false);
          expect(sender.readyState).not.toBe(WebSocket.OPEN);
        } finally {
          lookup.mockRestore();
          wire.mockRestore();
          vi.useRealTimers();
        }
      });
    } finally {
      owner.close();
      member.close();
    }
  });

  it.each([1, 2] as const)(
    "%i-2では聞き手のいいねが発表者と本人に届き、再接続には残らない",
    async (phase) => {
      const { roomId, owner, member, revision } = await setup({
        kind: "step",
        phase,
        step: 2,
      });
      try {
        member.ws.send(
          JSON.stringify({
            type: "reaction:send",
            kind: "like",
            phaseRevision: revision,
          }),
        );
        const event = await until(owner, "reaction:received");
        expect(event).toEqual({
          type: "reaction:received",
          id: expect.any(String),
          senderId: listener.sub,
          kind: "like",
          phaseRevision: revision,
        });
        expect(await until(member, "reaction:received")).toEqual(event);
        const reconnect = await connectRoomAs(listener, roomId);
        try {
          expect(await reconnect.next()).not.toHaveProperty("reactions");
        } finally {
          reconnect.close();
        }
      } finally {
        owner.close();
        member.close();
      }
    },
  );
});
