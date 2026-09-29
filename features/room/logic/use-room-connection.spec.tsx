// useRoomConnection（RoomDO への WebSocket 接続配線）の単体テスト。
// フェイク WebSocket を注入し、接続状態の遷移・メッセージ配送・
// 退出/解散クローズ時のホーム遷移と通知抑制・破棄時の close を検証する。
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
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

  simulateUnexpectedClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 1006 });
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    FakeWebSocket.instances = [];
    navigationMocks.replace.mockReset();
    notifyMocks.roomDisbanded.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

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
        phaseRevision: 0,
        phase: buildPhaseStep(2),
      }),
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({
      type: "phase:updated",
      phaseRevision: 0,
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

describe("切断後の完了ルーム復帰", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    navigationMocks.replace.mockReset();
  });
  it.each([
    "接続",
    "本文受信",
  ])("%sが停止しても時間切れ後の切断通知で再確認できる", async (stage) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_url, options) => {
        signal = options?.signal ?? undefined;
        const stalled = new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
        if (stage === "接続") return stalled;
        const response = Response.json({});
        vi.spyOn(response, "json").mockReturnValue(stalled);
        return response;
      })
      .mockResolvedValueOnce(
        Response.json(completedRoomFixture({ roomId: ROOM_ID })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => lastSocket().simulateUnexpectedClose());
    await act(async () => vi.advanceTimersByTimeAsync(9999));
    expect(signal?.aborted).toBe(false);
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(signal?.aborted).toBe(true);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      `/completed-rooms/${ROOM_ID}`,
    );
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
  it("完了通知を受け損ねても認可済み成果へ移り、WS再接続を止める", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(completedRoomFixture({ roomId: ROOM_ID })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    const socket = lastSocket();
    const socketCount = FakeWebSocket.instances.length;
    vi.useFakeTimers();
    await act(async () => {
      socket.simulateOpen();
      socket.simulateUnexpectedClose();
    });
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      `/completed-rooms/${ROOM_ID}`,
    );
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(FakeWebSocket.instances).toHaveLength(socketCount);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/completed-rooms/${ROOM_ID}`,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(socket.readyState).toBe(3);
  });
  it.each([
    401, 404, 503,
  ])("%sの場合は再訪へ遷移せず通常の再接続を維持する", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
  it.each([
    "unmount",
    "open",
    "leave",
  ])("取得中の%s後に古い結果で遷移しない", async (event) => {
    vi.useFakeTimers();
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    act(() => lastSocket().simulateUnexpectedClose());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      if (event === "unmount") unmount();
      else if (event === "open") lastSocket().simulateOpen();
      else lastSocket().simulateLeftRoomClose();
    });
    const options = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(options?.signal?.aborted).toBe(true);
    // 本文が未解決でも、アンマウントで完了確認・WS再接続のタイマーを残さない。
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    navigationMocks.replace.mockReset();
    await act(async () =>
      resolve(Response.json(completedRoomFixture({ roomId: ROOM_ID }))),
    );
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
  it("通信障害後の再接続失敗で完了状態を再確認する", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json(completedRoomFixture({ roomId: ROOM_ID })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      `/completed-rooms/${ROOM_ID}`,
    );
  });
});
