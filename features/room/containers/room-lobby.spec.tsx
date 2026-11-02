// RoomLobby（コンテナ）の統合テスト。
// フェイク WebSocket を注入し、start_phase 送信と phase:updated 受信の
// 両方向の配線を検証する。
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// useRouter の戻り値は毎レンダー同じ参照にする（effect の再実行ループ防止）。
const bindEntry = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  bindRoomEntryContinuation: bindEntry,
}));
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

it("13人目の本人も一覧から名前を編集でき、取消後は本人の名前へフォーカスを戻す", async () => {
  const initialMembers: ProtocolMember[] = Array.from(
    { length: 13 },
    (_, i) => ({
      userId:
        i === 12
          ? HOST_ID
          : `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      name: i === 12 ? "本人" : `参加者${i}`,
      color: "yellow",
    }),
  );
  renderStart({ initialMembers });
  const selfName = screen.getByRole("button", { name: "本人：表示名を変更" });
  fireEvent.click(selfName);
  expect(screen.getByRole("textbox", { name: "表示名" })).toHaveValue("本人");
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await waitFor(() => expect(selfName).toHaveFocus());
});

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
    boardHref?: string;
    entryAdmission?: string;
    saveDisplayNameAction?: import("./room-lobby").RoomLobbyProps["saveDisplayNameAction"];
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
      boardHref={options.boardHref}
      entryAdmission={options.entryAdmission}
      saveDisplayNameAction={options.saveDisplayNameAction}
    />,
  );
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket が生成されていない");
  if (options.open !== false) {
    act(() => {
      socket.simulateOpen();
      socket.simulateServerMessage({
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: options.initialMembers ?? [],
        phase: options.initialPhase ?? buildLobbyPhase(),
        isHost: options.isHost ?? true,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      });
    });
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

  it("isHost=false でも「開始する」ボタンを表示する", () => {
    renderStart({ isHost: false });
    expect(screen.getByTestId("start-phase-button")).toBeInTheDocument();
  });
});

describe("サーバーメッセージ → 画面反映", () => {
  it("snapshot.members でメンバー一覧が更新される", () => {
    const { socket } = renderStart();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [
          { userId: HOST_ID, name: "Host", color: "yellow" },
          { userId: MEMBER_ID, name: "Member", color: "green" },
        ],
        phase: buildLobbyPhase(),
        isHost: true,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
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
  });

  it("phase:updated: Step 1-1 を受信すると /rooms/[id] へ router.replace する", () => {
    renderStart();
    // snapshot でメンバー確定
    const socket = findSocket();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [{ userId: HOST_ID, name: "Host", color: "yellow" }],
        phase: buildLobbyPhase(),
        isHost: true,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phaseRevision: 0,
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

  it("非ホストも handleStart で start_phase を送る", () => {
    const { socket } = renderStart({ isHost: false });
    fireEvent.click(screen.getByTestId("start-phase-button"));
    expect(socket.sent).toContain(JSON.stringify({ type: "start_phase" }));
  });
});

it("開始後のボードURLを指定した場合は追従先を保持する", () => {
  renderStart({
    initialPhase: buildPhaseStep(1),
    boardHref: `/rooms/${ROOM_ID}?verify=follow`,
  });
  expect(navigationMocks.replace).toHaveBeenCalledWith(
    `/rooms/${ROOM_ID}?verify=follow`,
  );
});

describe("開始前のホスト引き継ぎ", () => {
  const members: ProtocolMember[] = [
    { userId: HOST_ID, name: "作成者", color: "yellow" },
    { userId: MEMBER_ID, name: "Hana Sato", color: "blue" },
  ];
  it("移譲通知後も参加者の開始操作を表示する", () => {
    const { socket } = renderStart({ initialMembers: members });
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: MEMBER_ID,
        hostRevision: 1,
      }),
    );
    expect(screen.getByTestId("start-phase-button")).toBeInTheDocument();
    expect(
      screen.getByTestId(`member-host-label-${MEMBER_ID}`),
    ).toBeInTheDocument();
  });
  it("対象名を確認しキャンセルでき、確認したときだけ改訂付きで送る", () => {
    const { socket } = renderStart({ initialMembers: members });
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: HOST_ID,
        hostRevision: 0,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hana Sato" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(socket.sent).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Hana Sato" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hana Satoさんをホストにする" }),
    );
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "host:transfer",
      targetUserId: MEMBER_ID,
      expectedHostRevision: 0,
    });
    expect(screen.getByRole("button", { name: "変更中…" })).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "相手が切断しました",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("相手が切断しました");
    expect(
      screen.getByRole("button", { name: "Hana Satoさんをホストにする" }),
    ).toBeEnabled();
  });
});

it("ホスト変更時に古い解散確認を閉じ、戻った後も古い確認を使わない", () => {
  const { socket } = renderStart();
  fireEvent.click(screen.getByRole("button", { name: "ルームを解散" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  act(() =>
    socket.simulateServerMessage({
      type: "host:updated",
      hostUserId: MEMBER_ID,
      hostRevision: 1,
    }),
  );
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  act(() =>
    socket.simulateServerMessage({
      type: "host:updated",
      hostUserId: HOST_ID,
      hostRevision: 2,
    }),
  );
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("start-phase-button"));
  expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual({
    type: "start_phase",
  });
});

it("引き継ぎ確認をキャンセルすると起点ボタンへフォーカスを戻す", async () => {
  const { socket } = renderStart({
    initialMembers: [
      { userId: HOST_ID, name: "作成者", color: "yellow" },
      { userId: MEMBER_ID, name: "Hana Sato", color: "blue" },
    ],
  });
  act(() =>
    socket.simulateServerMessage({
      type: "host:updated",
      hostUserId: HOST_ID,
      hostRevision: 0,
    }),
  );
  const trigger = screen.getByRole("button", {
    name: "Hana Sato",
  });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await vi.waitFor(() => expect(trigger).toHaveFocus());
});

describe("ホストによる参加者退出", () => {
  it("選択と確認から世代付き操作を送り、二重操作を止めサーバー確定で一覧を更新する", () => {
    const { socket } = renderStart({
      initialMembers: [
        { userId: HOST_ID, name: "Host", color: "yellow" },
        { userId: MEMBER_ID, name: "Member", color: "blue" },
      ],
    });
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: HOST_ID,
        hostRevision: 0,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Member" }));
    fireEvent.click(screen.getByRole("button", { name: "ルームから外す…" }));
    expect(socket.sent).toEqual([]);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Member");
    fireEvent.click(screen.getByRole("button", { name: "ルームから外す" }));
    const operation = JSON.parse(socket.sent[0]);
    expect(operation).toMatchObject({
      type: "member:remove",
      targetUserId: MEMBER_ID,
      expectedHostRevision: 0,
      operationId: expect.any(String),
    });
    expect(screen.getByRole("button", { name: "退出処理中…" })).toBeDisabled();
    expect(screen.getByTestId("start-phase-button")).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({ type: "member_left", userId: MEMBER_ID }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "member:removed",
        targetUserId: MEMBER_ID,
        operationId: operation.operationId,
      }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`member-row-${MEMBER_ID}`),
    ).not.toBeInTheDocument();
  });
});

it("本人表示から共通の改名APIを呼び、共有通知で全員の現在名を畳み込む", async () => {
  const member = {
    userId: HOST_ID,
    name: "元の名前",
    color: "yellow" as const,
  };
  let finish!: (value: { ok: true; name: string }) => void;
  const saveDisplayNameAction = vi.fn(
    () =>
      new Promise<{ ok: true; name: string }>((resolve) => {
        finish = resolve;
      }),
  );
  const { socket } = renderStart({
    initialMembers: [member],
    saveDisplayNameAction,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "元の名前：表示名を変更" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "表示名" }), {
    target: { value: "新しい表示名" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(screen.getByTestId(`member-row-${HOST_ID}`)).toHaveTextContent(
    "元の名前",
  );
  expect(saveDisplayNameAction).toHaveBeenCalledWith({
    roomId: ROOM_ID,
    expectedPrincipal: HOST_ID,
    name: "新しい表示名",
  });
  act(() =>
    socket.simulateServerMessage({
      type: "member:renamed",
      member: { ...member, name: "新しい表示名" },
      operationId: crypto.randomUUID(),
    }),
  );
  await act(async () => finish({ ok: true, name: "新しい表示名" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "新しい表示名：表示名を変更" }),
  ).toBeInTheDocument();
});

it.each(["rejected", "unavailable"])(
  "盤面遷移の認証引継ぎが%sなら通常の入室入口で判断をやり直す",
  async (outcome) => {
    if (outcome === "rejected")
      bindEntry.mockRejectedValueOnce(new Error("offline"));
    else bindEntry.mockResolvedValueOnce(null);
    const { socket } = renderStart({ entryAdmission: "signed-admission" });
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phaseRevision: 1,
        phase: buildPhaseStep(1),
      }),
    );
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith(`/rooms/${ROOM_ID}`),
    );
  },
);

it("開始成功後は移動が完了するまで開始中を維持する", () => {
  const { socket } = renderStart();
  fireEvent.click(screen.getByTestId("start-phase-button"));
  act(() =>
    socket.simulateServerMessage({
      type: "phase:updated",
      phaseRevision: 1,
      phase: buildPhaseStep(1),
    }),
  );
  expect(navigationMocks.replace).toHaveBeenCalled();
  expect(screen.getByTestId("start-phase-button")).toBeDisabled();
  expect(screen.getByTestId("start-phase-button")).toHaveTextContent("開始中…");
});

it("開始待ちの同じホストの更新通知では開始中を解除しない", () => {
  vi.useFakeTimers();
  try {
    const { socket } = renderStart();
    fireEvent.click(screen.getByTestId("start-phase-button"));
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: HOST_ID,
        hostRevision: 0,
      }),
    );
    expect(screen.getByTestId("start-phase-button")).toBeDisabled();
    expect(screen.getByTestId("start-phase-button")).toHaveTextContent(
      "開始中…",
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("start-phase-button")).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});
