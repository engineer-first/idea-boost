import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  WS_CLOSE_LEFT_ROOM,
  WS_CLOSE_LEFT_ROOM_REASON,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

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
const hour = 60 * 60 * 1000;

async function expectInviteClosed(inviteCode: string): Promise<void> {
  const response = await exports.default.fetch(
    "https://api.test/api/rooms/join",
    {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(participant),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: inviteCode }),
    },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    kind: "rejected",
    error: "終了したルームには参加できません。",
  });
}

describe("ルームの自動終了", () => {
  it.each(["retain", "discard"] as const)(
    "最後の在籍者を外すと招待URLから参加できない（閲覧権=%s）",
    async (access) => {
      const { roomId, inviteCode } = await createRoomAs(creator);
      const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
      await room.leave(creator.sub, access);
      expect(await room.isJoinable()).toBe(false);
      await expectInviteClosed(inviteCode);
    },
  );

  it("別の在籍者が残っていれば退出後も参加できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(creator);
    await joinRoomAs(participant, inviteCode);
    const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await room.leave(creator.sub, "retain");
    expect(await room.isJoinable()).toBe(true);
    expect(await room.isMember(participant.sub)).toBe(true);
  });

  it("全員切断から24時間で終了して招待URLを無効にする", async () => {
    const { roomId, inviteCode } = await createRoomAs(creator);
    const socket = await connectRoomAs(creator, roomId);
    await socket.next();
    await runInRoomDO(roomId, async (room, state) => {
      const server = state.getWebSockets()[0];
      const now = Date.now();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      try {
        server.close(1000);
        await room.webSocketClose(server, 1000, "", true);
        vi.setSystemTime(now + 24 * hour - 1);
        await room.alarm();
        expect(room.isJoinable()).toBe(true);
        expect(await state.storage.getAlarm()).toBe(now + 24 * hour);
        vi.setSystemTime(now + 24 * hour);
        await room.alarm();
        expect(room.isJoinable()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
    socket.close();
    await expectInviteClosed(inviteCode);
  });

  it("23時間後に再接続すると元の終了期限を取り消す", async () => {
    const { roomId } = await createRoomAs(creator);
    const socket = await connectRoomAs(creator, roomId);
    await socket.next();
    await runInRoomDO(roomId, async (room, state) => {
      const server = state.getWebSockets()[0];
      const now = Date.now();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      let reconnected: WebSocket | null = null;
      try {
        server.close(1000);
        await room.webSocketClose(server, 1000, "", true);
        vi.setSystemTime(now + 23 * hour);
        const response = await room.fetch(
          new Request("https://room/ws", {
            headers: {
              Upgrade: "websocket",
              "X-Idea-Boost-User-Id": creator.sub,
              "X-Idea-Boost-Session-Expires-At": String(
                Math.floor((now + 48 * hour) / 1000),
              ),
            },
          }),
        );
        expect(response.status).toBe(101);
        reconnected = response.webSocket;
        reconnected?.accept();
        vi.setSystemTime(now + 24 * hour);
        await room.alarm();
        expect(room.isJoinable()).toBe(true);
      } finally {
        reconnected?.close();
        vi.useRealTimers();
      }
    });
    socket.close();
  });
});

it("alarmの到着が遅れても24時間経過後の再接続で復活しない", async () => {
  const { roomId } = await createRoomAs(creator);
  await runInRoomDO(roomId, async (room) => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now + 25 * hour);
    try {
      const response = await room.fetch(
        new Request("https://room/ws", {
          headers: {
            Upgrade: "websocket",
            "X-Idea-Boost-User-Id": creator.sub,
            "X-Idea-Boost-Session-Expires-At": String(
              Math.floor((now + 48 * hour) / 1000),
            ),
          },
        }),
      );
      response.webSocket?.accept();
      response.webSocket?.close();
      expect(response.status).not.toBe(101);
      expect(room.isJoinable()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("同じ人の別タブが接続している間は終了期限を予約しない", async () => {
  const { roomId } = await createRoomAs(creator);
  const first = await connectRoomAs(creator, roomId);
  const second = await connectRoomAs(creator, roomId);
  await first.next();
  await second.next();
  try {
    await runInRoomDO(roomId, async (room, state) => {
      const [closing] = state.getWebSockets();
      closing.close(1000);
      await room.webSocketClose(closing, 1000, "", true);
      expect(
        state.storage.sql.exec("SELECT * FROM room_idle_deadline").toArray(),
      ).toEqual([]);
      expect(room.isJoinable()).toBe(true);
    });
  } finally {
    first.close();
    second.close();
  }
});

it("最後の退出でも保存済みの共有成果と保存期限を維持する", async () => {
  const { roomId } = await createRoomAs(creator);
  const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  const before = await room.getSharedOutcome();
  expect(before).not.toBeNull();
  await room.leave(creator.sub, "retain");
  const after = await room.getSharedOutcome();
  expect(after).toEqual(before);
});

it("最後の退出でも本人の接続には退出の終了コードを返す", async () => {
  const { roomId } = await createRoomAs(creator);
  const socket = await connectRoomAs(creator, roomId);
  await socket.next();
  try {
    await runInRoomDO(roomId, async (room, state) => {
      const server = state.getWebSockets()[0];
      const close = vi.spyOn(server, "close");
      try {
        await room.leave(creator.sub, "retain");
        expect(close).toHaveBeenNthCalledWith(
          1,
          WS_CLOSE_LEFT_ROOM,
          WS_CLOSE_LEFT_ROOM_REASON,
        );
      } finally {
        close.mockRestore();
      }
    });
  } finally {
    socket.close();
  }
});
