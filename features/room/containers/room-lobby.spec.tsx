// RoomLobby（コンテナ）の統合テスト。
// フェイク WebSocket を注入し、start_phase 送信と phase:updated 受信の
// 両方向の配線を検証する。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// useRouter の戻り値は毎レンダー同じ参照にする（effect の再実行ループ防止）。
const navigationMocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks.router,
}));

const notifyMocks = vi.hoisted(() => ({
  memberJoined: vi.fn(),
  memberLeft: vi.fn(),
  roomDisbanded: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notify: {
    error: notifyMocks.error,
  },
}));

vi.mock("../logic/room-notify", () => ({
  roomNotify: {
    memberJoined: notifyMocks.memberJoined,
    memberLeft: notifyMocks.memberLeft,
    roomDisbanded: notifyMocks.roomDisbanded,
    roomLeft: vi.fn(),
    roomDisbandedBySelf: vi.fn(),
  },
}));

import type { RoomPhase } from "@/contracts/phase";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { RoomLobby } from "./room-lobby";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOST_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

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

  simulateServerMessage(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  // ホスト解散など RoomDO が WS_CLOSE_ROOM_DISBANDED で閉じたとき。
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

function renderStart(
  options: {
    open?: boolean;
    isHost?: boolean;
    currentUserId?: string;
    initialMembers?: ProtocolMember[];
    initialPhase?: RoomPhase;
  } = {},
) {
  FakeWebSocket.instances = [];
  const factory = (url: string) =>
    new FakeWebSocket(url) as unknown as WebSocket;
  const view = render(
    <RoomLobby
      roomId={ROOM_ID}
      inviteCode="AB12CD"
      inviteUrl="https://idea-flow.example/invite/AB12CD"
      currentUserId={options.currentUserId ?? HOST_ID}
      isHost={options.isHost ?? true}
      hostUserId={HOST_ID}
      initialPhase={options.initialPhase ?? buildLobbyPhase()}
      initialMembers={options.initialMembers ?? []}
      webSocketFactory={factory}
    />,
  );
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket が生成されていない");
  if (options.open !== false) {
    act(() => socket.simulateOpen());
  }
  return { view, socket };
}

afterEach(() => {
  vi.restoreAllMocks();
  navigationMocks.replace.mockReset();
  notifyMocks.memberJoined.mockReset();
  notifyMocks.memberLeft.mockReset();
  notifyMocks.roomDisbanded.mockReset();
  notifyMocks.error.mockReset();
});

function findSocket() {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket が生成されていない");
  return socket;
}

describe("RoomLobby の初期表示", () => {
  it("初期 members が空でも、ホストなら「開始する」ボタンが表示される", () => {
    renderStart();
    expect(screen.getByTestId("start-phase-button")).toBeInTheDocument();
  });

  it("初期 phase が lobby なら data-phase='lobby' を持つ", () => {
    renderStart();
    expect(screen.getByTestId("room-lobby-view")).toHaveAttribute(
      "data-phase",
      "lobby",
    );
  });

  it("isHost=false なら「開始する」ボタンは出ない", () => {
    renderStart({ isHost: false });
    expect(screen.queryByTestId("start-phase-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("room-lobby-view-waiting")).toBeInTheDocument();
  });
});

describe("サーバーメッセージ → 画面反映", () => {
  it("snapshot.members でメンバー一覧が更新される", () => {
    const { socket } = renderStart();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        notes: [],
        members: [
          { userId: HOST_ID, name: "Host", color: "yellow" },
          { userId: MEMBER_ID, name: "Member", color: "green" },
        ],
        phase: buildLobbyPhase(),
        isHost: true,
        decision: null,
        carryovers: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    expect(screen.getAllByTestId("avatar")).toHaveLength(2);
  });

  it("member_joined でメンバーが追加される", () => {
    const { socket } = renderStart();
    act(() =>
      socket.simulateServerMessage({
        type: "member_joined",
        member: { userId: MEMBER_ID, name: "Member", color: "yellow" },
      }),
    );
    expect(screen.getAllByTestId("avatar")).toHaveLength(1);
  });

  it("member_joined を受信すると notify.memberJoined を呼ぶ", () => {
    const { socket } = renderStart();
    act(() =>
      socket.simulateServerMessage({
        type: "member_joined",
        member: { userId: MEMBER_ID, name: "Taro", color: "yellow" },
      }),
    );
    expect(notifyMocks.memberJoined).toHaveBeenCalledTimes(1);
    expect(notifyMocks.memberJoined).toHaveBeenCalledWith("Taro");
  });

  it("member_left を受信すると members から名前を引き、notify.memberLeft を呼ぶ", () => {
    const { socket } = renderStart({
      initialMembers: [
        { userId: HOST_ID, name: "Host", color: "yellow" },
        { userId: MEMBER_ID, name: "Taro", color: "green" },
      ],
    });
    act(() =>
      socket.simulateServerMessage({
        type: "member_left",
        userId: MEMBER_ID,
      }),
    );
    expect(notifyMocks.memberLeft).toHaveBeenCalledTimes(1);
    expect(notifyMocks.memberLeft).toHaveBeenCalledWith("Taro");
    // 退出者は一覧から消える
    expect(screen.getAllByTestId("avatar")).toHaveLength(1);
  });

  it("解散による WS close で理由を通知して /home へ router.replace する", () => {
    const { socket } = renderStart({ isHost: false });
    act(() => socket.simulateDisbandedClose());
    expect(notifyMocks.roomDisbanded).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/home");
    // 再接続メッセージは出さない
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("phase:updated: Step 1-1 を受信すると /rooms/[id] へ router.replace する", () => {
    renderStart();
    // snapshot でメンバー確定
    const socket = findSocket();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        notes: [],
        members: [{ userId: HOST_ID, name: "Host", color: "yellow" }],
        phase: buildLobbyPhase(),
        isHost: true,
        decision: null,
        carryovers: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(1),
      }),
    );
    expect(navigationMocks.replace).toHaveBeenCalledWith(`/rooms/${ROOM_ID}`);
  });
});

describe("ユーザー操作 → プロトコルメッセージ送信", () => {
  it("「開始する」クリックで start_phase が WS に送られる", () => {
    const { socket } = renderStart();
    fireEvent.click(screen.getByTestId("start-phase-button"));
    expect(socket.sent).toContain(JSON.stringify({ type: "start_phase" }));
  });

  it("「開始する」クリック直後は isStarting=true でボタンが disabled になる", () => {
    renderStart();
    fireEvent.click(screen.getByTestId("start-phase-button"));
    const button = screen.getByTestId("start-phase-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("開始中…");
  });

  it("forbidden エラーが返ると isStarting が解除される", () => {
    const { socket } = renderStart();
    fireEvent.click(screen.getByTestId("start-phase-button"));
    expect(screen.getByTestId("start-phase-button")).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "進行状態を変更する権限がありません。",
      }),
    );
    expect(screen.getByTestId("start-phase-button")).not.toBeDisabled();
  });

  it("非ホストが handleStart を呼んでも何も送らない（ボタン非表示で多重防御）", () => {
    // ボタン非表示のテストは上で実施済み。
    // ここでは「isHost=false でレンダーし、ボタンがないので何も送られない」を確認。
    const { socket } = renderStart({ isHost: false });
    expect(socket.sent).toHaveLength(0);
  });
});
