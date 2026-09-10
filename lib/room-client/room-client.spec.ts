// room-client の契約:
// - ClientMessage を JSON で送信し、受信を ServerMessage として parse して通知する
// - 予期しない切断では指数バックオフで自動再接続する（再接続後は snapshot が
//   届いて状態が復元されるのが RoomDO 側の契約）
// - close() 後は再接続しない
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomClient } from "@/lib/room-client/room-client";

type Listener = (event: {
  data?: unknown;
  code?: number;
  reason?: string;
}) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0; // CONNECTING
  sent: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.emit("close", { code: 1000 });
  }

  // --- テスト用のシミュレーション ---
  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.emit("open", {});
  }

  simulateMessage(data: string): void {
    this.emit("message", { data });
  }

  simulateUnexpectedClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 1006 });
  }

  simulateLeftRoomClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4000, reason: "left the room" });
  }

  simulateDisbandedClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4001, reason: "room disbanded" });
  }

  private emit(
    type: string,
    event: { data?: unknown; code?: number; reason?: string },
  ): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("no socket created");
  return socket;
}

const factory = (url: string) => new FakeWebSocket(url) as unknown as WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRoomClient", () => {
  it("指定した URL へ接続する", () => {
    const client = createRoomClient({
      url: "ws://test/api/rooms/x/ws",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    expect(latestSocket().url).toBe("ws://test/api/rooms/x/ws");
    client.close();
  });

  it("接続後に送った ClientMessage が JSON で送信される", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();

    client.send({ type: "note:create" });

    expect(latestSocket().sent).toEqual([
      JSON.stringify({ type: "note:create" }),
    ]);
    client.close();
  });

  it("未接続のうちは send しても例外にならず、送信もされない", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });

    expect(() => client.send({ type: "note:create" })).not.toThrow();
    expect(latestSocket().sent).toEqual([]);
    client.close();
  });

  it("受信したサーバーメッセージが parse されてコールバックへ届く", () => {
    const received: unknown[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: (message) => received.push(message),
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();

    latestSocket().simulateMessage(
      JSON.stringify({
        type: "note:deleted",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );

    expect(received).toEqual([
      {
        type: "note:deleted",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ]);
    client.close();
  });

  it("名前付きカーソルを受信し、再接続時に古い位置を再送しない", () => {
    const received: unknown[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: (message) => received.push(message),
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();
    client.send({ type: "cursor:update", x: 10, y: 20 });
    latestSocket().simulateMessage(
      JSON.stringify({
        type: "cursor:updated",
        cursor: {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 30,
          y: 40,
          draggingNoteId: null,
        },
      }),
    );
    expect(received).toEqual([
      expect.objectContaining({ type: "cursor:updated" }),
    ]);

    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(1_000);
    latestSocket().simulateOpen();
    expect(latestSocket().sent).toEqual([]);
    client.close();
  });

  it("スキーマに合わない受信データはコールバックに渡さない", () => {
    const received: unknown[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: (message) => received.push(message),
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();

    latestSocket().simulateMessage("garbage");
    latestSocket().simulateMessage(JSON.stringify({ type: "unknown" }));

    expect(received).toEqual([]);
    client.close();
  });

  it("予期しない切断のあと、時間経過で自動的に再接続する", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();
    expect(FakeWebSocket.instances).toHaveLength(1);

    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(1000);

    expect(FakeWebSocket.instances).toHaveLength(2);
    client.close();
  });

  it("個人退出の close（code 4000）では再接続せず ended を通知する", () => {
    const statuses: string[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();
    latestSocket().simulateLeftRoomClose();
    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(statuses).toContain("ended");
    expect(statuses).not.toContain("closed");
    client.close();
  });

  it("解散の close（code 4001）では再接続せず disbanded を通知する", () => {
    const statuses: string[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();
    latestSocket().simulateDisbandedClose();
    vi.advanceTimersByTime(10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(statuses).toContain("disbanded");
    expect(statuses).not.toContain("closed");
    client.close();
  });

  it("再接続の間隔は指数的に伸びる", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });

    // 1回目の切断 → 1秒後に再接続
    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // 2回目の切断 → 2秒後に再接続
    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    client.close();
  });

  it("接続が確立するとバックオフはリセットされる", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });

    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(1000);
    latestSocket().simulateOpen();

    latestSocket().simulateUnexpectedClose();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);

    client.close();
  });

  it("接続ライフサイクルを onStatusChange で通知する", () => {
    // UI が「接続中 / 接続済み / 切断（再接続待ち）」を表示するための通知。
    const statuses: string[] = [];
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
      onStatusChange: (status) => statuses.push(status),
    });
    expect(statuses).toEqual(["connecting"]);

    latestSocket().simulateOpen();
    expect(statuses).toEqual(["connecting", "open"]);

    latestSocket().simulateUnexpectedClose();
    expect(statuses).toEqual(["connecting", "open", "closed"]);

    // 再接続の試行開始も connecting として通知される。
    vi.advanceTimersByTime(1000);
    expect(statuses).toEqual(["connecting", "open", "closed", "connecting"]);

    client.close();
  });

  it("close() 後は再接続しない", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    latestSocket().simulateOpen();

    client.close();
    vi.advanceTimersByTime(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("再接続待ちの間に close() すると再接続はキャンセルされる", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    latestSocket().simulateUnexpectedClose();

    client.close();
    vi.advanceTimersByTime(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
