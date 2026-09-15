// useRoomConnection（RoomDO への WebSocket 接続配線）の単体テスト。
// フェイク WebSocket を注入し、接続状態の遷移・メッセージ配送・
// 退出/解散クローズ時のホーム遷移と通知抑制・破棄時の close を検証する。
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks.router,
}));

const notifyMocks = vi.hoisted(() => ({
  roomDisbanded: vi.fn(),
}));
vi.mock("./room-notify", () => ({
  roomNotify: {
    roomDisbanded: notifyMocks.roomDisbanded,
    roomLeft: vi.fn(),
    roomDisbandedBySelf: vi.fn(),
    memberJoined: vi.fn(),
    memberLeft: vi.fn(),
  },
}));

import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ServerMessage } from "@/contracts/room-protocol";
import { useRoomConnection } from "./use-room-connection";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Listener = (event: {
  data?: unknown;
  code?: number;
  reason?: string;
}) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
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
    this.readyState = 3;
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  simulateDisbandedClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4001, reason: "room disbanded" });
  }

  simulateLeftRoomClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4000, reason: "left the room" });
  }

  simulateServerMessage(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
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

function factory(url: string): WebSocket {
  return new FakeWebSocket(url) as unknown as WebSocket;
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket が生成されていない");
  return socket;
}

describe("useRoomConnection", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    navigationMocks.replace.mockReset();
    notifyMocks.roomDisbanded.mockReset();
  });

  it("生成直後は connecting、open イベントで open になる", () => {
    const { result } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    expect(result.current.connectionStatus).toBe("connecting");
    act(() => lastSocket().simulateOpen());
    expect(result.current.connectionStatus).toBe("open");
  });

  it("サーバーメッセージを最新の onMessage へ配送する", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onMessage }: { onMessage: (m: ServerMessage) => void }) =>
        useRoomConnection({
          roomId: ROOM_ID,
          onMessage,
          webSocketFactory: factory,
        }),
      { initialProps: { onMessage: first } },
    );

    act(() => lastSocket().simulateOpen());
    // ハンドラを差し替えても、再接続なしで新しいハンドラへ届く。
    rerender({ onMessage: second });
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() =>
      lastSocket().simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
      }),
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({
      type: "phase:updated",
      phase: buildPhaseStep(2),
    });
  });

  it("send はクライアントへ委譲される", () => {
    const { result } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    act(() => lastSocket().simulateOpen());
    act(() => result.current.send({ type: "note:create" }));
    expect(lastSocket().sent).toContain(
      JSON.stringify({ type: "note:create" }),
    );
  });

  it("解散クローズでは roomDisbanded を通知してホームへ戻す", () => {
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    act(() => lastSocket().simulateOpen());
    act(() => lastSocket().simulateDisbandedClose());

    expect(notifyMocks.roomDisbanded).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/home");
  });

  it("自分の退出処理中（isLeavingRef=true）の解散クローズでは通知しない", () => {
    const isLeavingRef = { current: true };
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
        isLeavingRef,
      }),
    );

    act(() => lastSocket().simulateOpen());
    act(() => lastSocket().simulateDisbandedClose());

    expect(notifyMocks.roomDisbanded).not.toHaveBeenCalled();
    expect(navigationMocks.replace).toHaveBeenCalledWith("/home");
  });

  it("個人退出クローズ（ended）は通知なしでホームへ戻す", () => {
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    act(() => lastSocket().simulateOpen());
    act(() => lastSocket().simulateLeftRoomClose());

    expect(notifyMocks.roomDisbanded).not.toHaveBeenCalled();
    expect(navigationMocks.replace).toHaveBeenCalledWith("/home");
  });

  it("アンマウントで WebSocket を close する", () => {
    const { unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    act(() => lastSocket().simulateOpen());
    unmount();
    expect(lastSocket().readyState).toBe(3);
  });
});
