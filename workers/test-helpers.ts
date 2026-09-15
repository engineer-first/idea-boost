// workers テスト共通のヘルパー。
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { expect } from "vitest";
import {
  parseServerMessage,
  type ServerMessage,
} from "../contracts/room-protocol";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";
import type { RoomDO } from "./room/room-do";

export type TestUser = {
  sub: string;
  email: string;
  name: string;
};

// RoomDO のインスタンスメソッド（と、必要なら DurableObjectState）を
// 直接呼び出して内部状態を検査する。
export function runInRoomDO<T>(
  roomId: string,
  fn: (instance: RoomDO, state: DurableObjectState) => T | Promise<T>,
): Promise<T> {
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  return runInDurableObject(stub, fn);
}

// members テーブルを参加順（joined_at 昇順）で直接読む。
// 「メンバーIDの一覧を返す」は本番の RPC としては使われておらず、この検査
// のためだけに RoomDO の公開面を広げるのは避けたいので、DurableObjectState
// 経由でストレージを直接読むテストヘルパーとして実装する。
export function listMemberIds(roomId: string): Promise<string[]> {
  return runInRoomDO(roomId, (_instance, state) => {
    const cursor = state.storage.sql.exec(
      "SELECT user_id FROM members ORDER BY joined_at",
    );
    return cursor.toArray().map((row) => String(row.user_id));
  });
}

export async function sessionCookieFor(user: TestUser): Promise<string> {
  const token = await signToken(user, {
    secret: env.SESSION_SECRET,
    audience: TOKEN_AUDIENCE.session,
    expiresInSeconds: 600,
  });
  return `idea_boost_session=${token}`;
}

export async function createRoomAs(
  user: TestUser,
): Promise<{ roomId: string; inviteCode: string }> {
  const res = await SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: { Cookie: await sessionCookieFor(user) },
  });
  expect(res.status).toBe(200);
  return res.json();
}

export async function joinRoomAs(user: TestUser, code: string): Promise<void> {
  const res = await SELF.fetch("https://api.test/api/rooms/join", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  expect(res.status).toBe(200);
}

// サーバーメッセージを受信順に取り出せるようにラップした WebSocket。
export type RoomSocket = {
  ws: WebSocket;
  // 次のメッセージを待つ（届いていれば即時解決）。
  next(): Promise<ServerMessage>;
  close(): void;
};

export async function connectRoomAs(
  user: TestUser,
  roomId: string,
): Promise<RoomSocket> {
  const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
    headers: {
      Upgrade: "websocket",
      Cookie: await sessionCookieFor(user),
    },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error("webSocket missing on 101 response");

  const queue: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];

  ws.accept();
  ws.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      throw new Error(`サーバーメッセージを解釈できません: ${event.data}`);
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter(message);
    } else {
      queue.push(message);
    }
  });

  return {
    ws,
    next() {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      ws.close();
    },
  };
}

// runInDurableObject 内で acceptWebSocket した WS の外側 ([0]) を受け取り、
// 受信メッセージを JSON 文字列のまま蓄積するヘルパ。broadcast 経路の単体テスト用。
// WebSocketPair は [client, server] の 2-tuple を返す。
//  - [0] (client): Durable Object の外側で、メッセージを受信する側
//  - [1] (server): Durable Object 側で、ctx.acceptWebSocket(server) に登録する側
export type CollectingWs = {
  raw(): string[];
  close(): void;
};

export function openCollectingWs(
  pair: readonly [WebSocket, WebSocket],
): CollectingWs {
  const client = pair[0];
  const server = pair[1];
  const raw: string[] = [];
  client.addEventListener("message", (event) => {
    raw.push(String(event.data));
  });
  return {
    raw: () => [...raw],
    close() {
      try {
        client.close();
      } catch {
        // already closed
      }
      try {
        server.close();
      } catch {
        // already closed
      }
    },
  };
}
