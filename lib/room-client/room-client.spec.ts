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

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
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
  vi.spyOn(Math, "random").mockReturnValue(1);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe("ホストの世代を送信境界で固定する", () => {
  it("ホスト更新を受信すると進行操作に付け、古い通知では巻き戻さない", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    const socket = latestSocket();
    socket.simulateOpen();
    socket.simulateMessage(
      JSON.stringify({
        type: "host:updated",
        hostUserId: "11111111-1111-4111-8111-111111111111",
        hostRevision: 2,
      }),
    );
    socket.simulateMessage(
      JSON.stringify({
        type: "host:updated",
        hostUserId: "22222222-2222-4222-8222-222222222222",
        hostRevision: 1,
      }),
    );
    client.send({ type: "timer:pause" });
    expect(JSON.parse(socket.sent.at(-1) ?? "null")).toEqual({
      type: "timer:pause",
      expectedHostRevision: 2,
    });
    client.close();
  });
  it("確認画面が固定した古い世代は新しい世代で上書きしない", () => {
    const client = createRoomClient({
      url: "ws://test",
      onMessage: () => {},
      webSocketFactory: factory,
    });
    const socket = latestSocket();
    socket.simulateOpen();
    socket.simulateMessage(
      JSON.stringify({
        type: "host:updated",
        hostUserId: "11111111-1111-4111-8111-111111111111",
        hostRevision: 2,
      }),
    );
    client.send({ type: "start_phase", expectedHostRevision: 0 });
    expect(JSON.parse(socket.sent.at(-1) ?? "null")).toEqual({
      type: "start_phase",
      expectedHostRevision: 0,
    });
    client.close();
  });
});

it("jitterを注入でき、指数待ち時間の半分から上限までに分散する", () => {
  const client = createRoomClient({
    url: "ws://test",
    onMessage: () => {},
    webSocketFactory: factory,
    random: () => 0,
  });
  latestSocket().simulateUnexpectedClose();
  vi.advanceTimersByTime(499);
  expect(FakeWebSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(FakeWebSocket.instances).toHaveLength(2);
  client.close();
});
it("offline中の接続とtimerを止め、onlineで一度だけ再開しcloseでlistenerを解除する", () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const client = createRoomClient({
    url: "ws://test",
    onMessage: () => {},
    webSocketFactory: factory,
  });
  expect(FakeWebSocket.instances).toHaveLength(0);
  vi.advanceTimersByTime(60000);
  expect(FakeWebSocket.instances).toHaveLength(0);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("online"));
  expect(FakeWebSocket.instances).toHaveLength(1);
  client.close();
  window.dispatchEvent(new Event("online"));
  expect(FakeWebSocket.instances).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  0, 1,
])("jitter %sの連続失敗でも待ち時間は8秒以内に収まる", (random) => {
  const client = createRoomClient({
    url: "ws://test",
    onMessage: () => {},
    webSocketFactory: factory,
    random: () => random,
  });
  for (const ceiling of [1000, 2000, 4000, 8000, 8000, 8000]) {
    const count = FakeWebSocket.instances.length;
    latestSocket().simulateUnexpectedClose();
    const delay = ceiling * (0.5 + random * 0.5);
    vi.advanceTimersByTime(delay - 1);
    expect(FakeWebSocket.instances).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
  }
  client.close();
  expect(vi.getTimerCount()).toBe(0);
});
it("offlineで既存socketを閉じ、古いopen/message/closeは配送せずonlineで新接続だけを使う", () => {
  const messages = vi.fn();
  const statuses = vi.fn();
  const client = createRoomClient({
    url: "ws://test",
    onMessage: messages,
    onStatusChange: statuses,
    webSocketFactory: factory,
  });
  const stale = latestSocket();
  stale.simulateOpen();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  window.dispatchEvent(new Event("offline"));
  expect(stale.readyState).toBe(3);
  const count = statuses.mock.calls.length;
  stale.simulateOpen();
  stale.simulateUnexpectedClose();
  stale.simulateMessage(
    JSON.stringify({
      type: "note:deleted",
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
  );
  expect(statuses).toHaveBeenCalledTimes(count);
  expect(messages).not.toHaveBeenCalled();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  window.dispatchEvent(new Event("online"));
  expect(FakeWebSocket.instances).toHaveLength(2);
  client.close();
  expect(vi.getTimerCount()).toBe(0);
});
