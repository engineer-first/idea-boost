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
import { ServerMessageSchema } from "@/contracts/room-protocol";
import { readLastRoom } from "@/lib/room-client/last-room-storage";
import { useRoomConnection } from "./use-room-connection";

afterEach(() => vi.restoreAllMocks());

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
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    FakeWebSocket.instances = [];
    navigationMocks.replace.mockReset();
    notifyMocks.roomDisbanded.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("ソケットopenでは同期中を維持し、snapshot適用後に操作可能になる", () => {
    const { result } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );

    expect(result.current.connectionStatus).toBe("connecting");
    act(() => lastSocket().simulateOpen());
    expect(result.current.connectionStatus).toBe("connecting");
    expect(result.current.send({ type: "note:create" })).toBe(false);
    act(() => lastSocket().simulateServerMessage(snapshot()));
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
    act(() => lastSocket().simulateServerMessage(snapshot()));
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
    503,
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
    "snapshot",
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
      else if (event === "snapshot")
        lastSocket().simulateServerMessage(snapshot());
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

function snapshot() {
  return ServerMessageSchema.parse({
    type: "snapshot",
    phaseRevision: 0,
    notes: [],
    members: [],
    phase: { kind: "lobby" },
    isHost: true,
    timer: { status: "idle" },
    serverNow: 1,
    decision: null,
    carryovers: [],
    completedVoterIds: [],
  });
}
describe("切断時間", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("再試行とsocket openで時間をリセットせず、snapshotまで10秒の案内を維持する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const { result, unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    act(() => {
      lastSocket().simulateOpen();
      lastSocket().simulateServerMessage(snapshot());
    });
    await act(async () => lastSocket().simulateUnexpectedClose());
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    act(() => lastSocket().simulateOpen());
    expect(result.current.connectionStatus).not.toBe("open");
    expect(result.current.connectionDelayed).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.connectionDelayed).toBe(true);
    act(() =>
      lastSocket().simulateServerMessage({
        type: "phase:updated",
        phaseRevision: 1,
        phase: buildPhaseStep(2),
      }),
    );
    expect(result.current.connectionDelayed).toBe(true);
    act(() => lastSocket().simulateServerMessage(snapshot()));
    expect(result.current.connectionStatus).toBe("open");
    expect(result.current.connectionDelayed).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("認可済みsnapshotで本人が在籍すると候補を更新し、通常切断で残して退出で消す", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  const { unmount } = renderHook(() =>
    useRoomConnection({
      roomId: ROOM_ID,
      currentUserId: userId,
      onMessage: vi.fn(),
      webSocketFactory: factory,
    }),
  );
  act(() => {
    lastSocket().simulateOpen();
    lastSocket().simulateServerMessage(snapshot());
  });
  expect(readLastRoom(userId)).toBeNull();
  act(() =>
    lastSocket().simulateServerMessage({
      ...snapshot(),
      members: [{ userId, name: "本人", color: "yellow" }],
    }),
  );
  expect(readLastRoom(userId)).toBe(ROOM_ID);
  await act(async () => lastSocket().simulateUnexpectedClose());
  expect(readLastRoom(userId)).toBe(ROOM_ID);
  act(() => lastSocket().simulateLeftRoomClose());
  expect(readLastRoom(userId)).toBeNull();
  unmount();
  vi.unstubAllGlobals();
});

it("snapshot適用中の本文保存確認は送信でき、共有の更新は適用後まで止める", () => {
  const operationId = "33333333-3333-4333-8333-333333333333";
  let sendDuringSnapshot:
    | ((
        message: Parameters<ReturnType<typeof useRoomConnection>["send"]>[0],
      ) => boolean)
    | undefined;
  const onMessage = vi.fn((message: ServerMessage) => {
    if (message.type !== "snapshot") return;
    expect(sendDuringSnapshot?.({ type: "note:create" })).toBe(false);
    expect(
      sendDuringSnapshot?.({ type: "note:content-status", operationId }),
    ).toBe(true);
  });
  const { result } = renderHook(() =>
    useRoomConnection({
      roomId: ROOM_ID,
      onMessage,
      webSocketFactory: factory,
    }),
  );
  sendDuringSnapshot = result.current.send;
  act(() => {
    lastSocket().simulateOpen();
    lastSocket().simulateServerMessage(snapshot());
  });
  expect(lastSocket().sent).toContain(
    JSON.stringify({ type: "note:content-status", operationId }),
  );
});

describe("再接続の終端判定と世代", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    navigationMocks.replace.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it.each([
    401, 404,
  ])("%sで再試行を止め、画面に回収入口を残す", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(result.current.connectionStatus).toBe(
      status === 401 ? "auth-required" : "unavailable",
    );
    expect(fetchMock).toHaveBeenCalledTimes(status === 401 ? 1 : 2);
    if (status === 404)
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/rooms/${ROOM_ID}`,
        expect.objectContaining({ cache: "no-store" }),
      );
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
  it.each([
    200, 503,
  ])("完了404でも現在ルーム%sなら再試行する", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValue(new Response(null, { status })),
    );
    const { result, unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => lastSocket().simulateUnexpectedClose());
    expect(result.current.connectionStatus).toBe("closed");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(FakeWebSocket.instances).toHaveLength(2);
    unmount();
  });
  it.each([401, 404, 200])("新snapshot後の遅延%sは無効", async (status) => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { result, unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    act(() => lastSocket().simulateUnexpectedClose());
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    act(() => {
      lastSocket().simulateOpen();
      lastSocket().simulateServerMessage(snapshot());
    });
    await act(async () =>
      resolve(
        status === 200
          ? Response.json(completedRoomFixture({ roomId: ROOM_ID }))
          : new Response(null, { status }),
      ),
    );
    expect(result.current.connectionStatus).toBe("open");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    unmount();
  });
  it("socket openだけでは照会を打ち切らない", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { result, unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    act(() => lastSocket().simulateUnexpectedClose());
    act(() => lastSocket().simulateOpen());
    await act(async () => resolve(new Response(null, { status: 401 })));
    expect(result.current.connectionStatus).toBe("auth-required");
    unmount();
  });
  it("offline中は照会せずonlineで接続を再開する", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = renderHook(() =>
      useRoomConnection({
        roomId: ROOM_ID,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    );
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(fetch).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(FakeWebSocket.instances).toHaveLength(1);
    unmount();
  });
});

it.each([
  "snapshot",
  "room-change",
  "unmount",
] as const)("現在ルーム照会中の%s後は遅延404で終端へ戻さない", async (event) => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender, unmount } = renderHook(
    ({ roomId }) =>
      useRoomConnection({
        roomId,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    { initialProps: { roomId: ROOM_ID } },
  );
  await act(async () => lastSocket().simulateUnexpectedClose());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const signal = fetchMock.mock.calls[1]?.[1]?.signal;
  if (event === "snapshot")
    act(() => lastSocket().simulateServerMessage(snapshot()));
  else if (event === "room-change")
    rerender({ roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  else unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(new Response(null, { status: 404 })));
  expect(result.current.connectionStatus).not.toBe("unavailable");
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each([
  401, 404, 200,
])("別ルームへの変更後の遅延完了%sで新接続を壊さない", async (status) => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const { result, rerender, unmount } = renderHook(
    ({ roomId }) =>
      useRoomConnection({
        roomId,
        onMessage: vi.fn(),
        webSocketFactory: factory,
      }),
    { initialProps: { roomId: ROOM_ID } },
  );
  act(() => lastSocket().simulateUnexpectedClose());
  rerender({ roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  act(() => {
    lastSocket().simulateOpen();
    lastSocket().simulateServerMessage(snapshot());
  });
  navigationMocks.replace.mockReset();
  await act(async () =>
    resolve(
      status === 200
        ? Response.json(completedRoomFixture({ roomId: ROOM_ID }))
        : new Response(null, { status }),
    ),
  );
  expect(result.current.connectionStatus).toBe("open");
  expect(navigationMocks.replace).not.toHaveBeenCalled();
  unmount();
  vi.unstubAllGlobals();
});
it("offlineになると実行中の照会を中止し、online後の新snapshotで復帰する", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const { result, unmount } = renderHook(() =>
    useRoomConnection({
      roomId: ROOM_ID,
      onMessage: vi.fn(),
      webSocketFactory: factory,
    }),
  );
  act(() => lastSocket().simulateUnexpectedClose());
  const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  expect(signal?.aborted).toBe(true);
  const count = FakeWebSocket.instances.length;
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(FakeWebSocket.instances).toHaveLength(count);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  act(() => {
    lastSocket().simulateOpen();
    lastSocket().simulateServerMessage(snapshot());
  });
  expect(result.current.connectionStatus).toBe("open");
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
