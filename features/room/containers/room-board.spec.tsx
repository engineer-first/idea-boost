// RoomBoard（コンテナ）の統合テスト。
// フェイク WebSocket を注入し、「サーバーメッセージ → 画面反映」と
// 「ユーザー操作 → プロトコルメッセージ送信」の両方向の配線を検証する。
// RoomBoardView / NoteCard / notes-reducer 自体の仕様は各ファイルの spec が担う。
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  noteExcluded: vi.fn(),
  bulkCandidatesExcluded: vi.fn(),
  automaticallyExcludedCandidates: vi.fn(),
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
    noteExcluded: notifyMocks.noteExcluded,
    bulkCandidatesExcluded: notifyMocks.bulkCandidatesExcluded,
    automaticallyExcludedCandidates:
      notifyMocks.automaticallyExcludedCandidates,
  },
}));

import type { PersistentGroup } from "@/contracts/grouping";
import type { RoomPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type {
  Carryover,
  Decision,
  ProtocolNote,
} from "@/contracts/room-protocol";
import { buildCarryover, buildGroup } from "@/contracts/room-protocol.fixture";
import { DECIDED_ISSUE_LABEL, HMW_TEMPLATES } from "@/features/hmw";
import { FORCE_NEXT_PHASE_COPY } from "../molecules/force-next-phase-dialog";
import { RoomBoard } from "./room-board";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STICKER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const THIRD_PRIVATE_NOTE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const NEW_PRIVATE_NOTE_ID = "11111111-2222-4222-8222-111111111111";
const nativeElementFromPoint = document.elementFromPoint;

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
    const message = JSON.parse(data) as {
      type?: string;
      dragId?: string;
    };
    if (message.type === "note:drag:start" && message.dragId) {
      this.simulateServerMessage({
        type: "note:drag:result",
        dragId: message.dragId,
        accepted: true,
      });
    }
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
    this.emit("close", {});
  }

  simulateLeftRoomClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4000, reason: "left the room" });
  }

  simulateDisbandedClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4001, reason: "room disbanded" });
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

function expectSent(socket: FakeWebSocket, expected: object): void {
  expect(socket.sent.map((payload) => JSON.parse(payload))).toContainEqual(
    expect.objectContaining(expected),
  );
}

function protocolNote(overrides?: Partial<ProtocolNote>): ProtocolNote {
  return {
    id: NOTE_ID,
    authorId: USER_ID,
    content: "最初の付箋",
    visibility: "shared",
    excluded: false,
    color: "yellow",
    x: 100,
    y: 100,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
    ...overrides,
    stackOrder: overrides?.stackOrder ?? 0,
    dotVoteStickers: overrides?.dotVoteStickers ?? [],
  };
}

function renderBoard(options: { open?: boolean; isHost?: boolean } = {}) {
  FakeWebSocket.instances = [];
  const factory = (url: string) =>
    new FakeWebSocket(url) as unknown as WebSocket;
  const view = render(
    <RoomBoard
      roomId={ROOM_ID}
      inviteCode="AB12CD"
      inviteUrl="https://idea-flow.example/invite/AB12CD"
      currentUserId={USER_ID}
      isHost={options.isHost ?? true}
      hostUserId={USER_ID}
      initialMembers={[]}
      initialPhase={buildPhaseStep(1)}
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

function connectWithSnapshot(
  notes: ProtocolNote[] = [],
  options?: {
    phase?: RoomPhase;
    isHost?: boolean;
    carryovers?: Carryover[];
    groups?: PersistentGroup[];
    decision?: Decision | null;
    adoptionFocusNoteId?: string | null;
    ideaMapSizeLevel?: number;
    ideaMapSizeInitialized?: boolean;
    ideaMapDragging?: boolean;
  },
) {
  const { view, socket } = renderBoard({ isHost: options?.isHost ?? true });

  act(() =>
    socket.simulateServerMessage({
      type: "snapshot",
      notes,
      members: [],
      phase: options?.phase ?? buildPhaseStep(1),
      isHost: options?.isHost ?? true,
      decision: options?.decision ?? null,
      adoptionFocusNoteId: options?.adoptionFocusNoteId ?? null,
      carryovers: options?.carryovers ?? [],
      completedVoterIds: [],
      groups: options?.groups,
      timer: { status: "idle" },
      serverNow: Date.now(),
      ideaMapSizeLevel: options?.ideaMapSizeLevel,
      ideaMapSizeInitialized: options?.ideaMapSizeInitialized,
      ideaMapDragging: options?.ideaMapDragging,
    }),
  );

  return { view, socket };
}

function openPrivateNotesToolbar() {
  const toolbar = screen.getByTestId("private-notes-toolbar");
  const openButton = within(toolbar).queryByRole("button", {
    name: "マイ付箋を開く",
  });
  if (openButton) fireEvent.click(openButton);
  return toolbar;
}

function mockPrivateToolbarLayout(toolbar: HTMLElement): void {
  Object.defineProperty(toolbar, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 600,
      top: 0,
      right: 900,
      bottom: 600,
      width: 300,
      height: 600,
    }),
  });
  const noteTops = [100, 256, 412];
  within(toolbar)
    .getAllByTestId("note-card")
    .forEach((card, index) => {
      const top = noteTops[index];
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
        x: 600,
        y: top,
        top,
        right: 800,
        bottom: top + 144,
        left: 600,
        width: 200,
        height: 144,
        toJSON: () => ({}),
      });
    });
}

function privateNoteIds(toolbar: HTMLElement): string[] {
  return within(toolbar)
    .getAllByTestId("note-card")
    .map((card) => {
      const noteId = card.getAttribute("data-note-id");
      if (!noteId) throw new Error("付箋IDがありません");
      return noteId;
    });
}

function dropPaletteSticker(kind: "subjective" | "objective"): void {
  const note = screen.getByTestId("note-card");
  vi.spyOn(note, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 100,
    top: 100,
    right: 300,
    bottom: 250,
    left: 100,
    width: 200,
    height: 150,
    toJSON: () => ({}),
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => note,
  });
  const label = kind === "subjective" ? /主観シール 残り/ : /客観シール 残り/;
  fireEvent.pointerDown(screen.getByRole("button", { name: label }), {
    pointerId: 8,
    clientX: 320,
    clientY: 24,
  });
  fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
    pointerId: 8,
    clientX: 280,
    clientY: 80,
  });
  fireEvent.pointerUp(screen.getByTestId("room-board-view-root"), {
    pointerId: 8,
    clientX: 150,
    clientY: 175,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: nativeElementFromPoint,
  });
  navigationMocks.replace.mockReset();
  notifyMocks.memberJoined.mockReset();
  notifyMocks.memberLeft.mockReset();
  notifyMocks.roomDisbanded.mockReset();
  notifyMocks.error.mockReset();
  notifyMocks.noteExcluded.mockReset();
  notifyMocks.bulkCandidatesExcluded.mockReset();
  notifyMocks.automaticallyExcludedCandidates.mockReset();
});

describe("メンバー参加・退出の通知", () => {
  it("member_joined を受信すると notify.memberJoined を呼ぶ", () => {
    const { socket } = connectWithSnapshot([]);
    act(() =>
      socket.simulateServerMessage({
        type: "member_joined",
        member: { userId: OTHER_USER_ID, name: "Taro", color: "yellow" },
      }),
    );
    expect(notifyMocks.memberJoined).toHaveBeenCalledTimes(1);
    expect(notifyMocks.memberJoined).toHaveBeenCalledWith("Taro");
  });

  it("member_left を受信すると members から名前を引き、notify.memberLeft を呼ぶ", () => {
    const { socket } = renderBoard();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        notes: [],
        members: [
          { userId: USER_ID, name: "Host", color: "yellow" },
          { userId: OTHER_USER_ID, name: "Taro", color: "green" },
        ],
        phase: buildPhaseStep(1),
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
        type: "member_left",
        userId: OTHER_USER_ID,
      }),
    );
    expect(notifyMocks.memberLeft).toHaveBeenCalledTimes(1);
    expect(notifyMocks.memberLeft).toHaveBeenCalledWith("Taro");
  });
});

describe("サーバーメッセージ → 画面反映", () => {
  it("共有作業中だけ他者のカーソルを表示し、切断時に消す", () => {
    const { socket } = connectWithSnapshot([], { phase: buildPhaseStep(2) });
    act(() =>
      socket.simulateServerMessage({
        type: "cursor:updated",
        cursor: {
          userId: OTHER_USER_ID,
          name: "Taro",
          color: "green",
          x: 30,
          y: 40,
          draggingNoteId: null,
        },
      }),
    );
    expect(screen.getByText("Taro")).toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "cursor:updated",
        cursor: {
          userId: USER_ID,
          name: "Self",
          color: "yellow",
          x: 50,
          y: 60,
          draggingNoteId: null,
        },
      }),
    );
    expect(screen.queryByText("Self")).not.toBeInTheDocument();

    act(() => socket.simulateUnexpectedClose());
    expect(screen.queryByText("Taro")).not.toBeInTheDocument();
  });

  it("snapshot のタイマーを表示し、ホスト操作を timer:* として送る", () => {
    const { socket } = connectWithSnapshot([]);

    fireEvent.click(screen.getByTestId("room-timer"));
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(socket.sent).toContain(
      JSON.stringify({ type: "timer:start", durationMs: 180_000 }),
    );

    act(() =>
      socket.simulateServerMessage({
        type: "timer:updated",
        timer: { status: "paused", remainingMs: 30_000, durationMs: 180_000 },
        serverNow: Date.now(),
      }),
    );
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    fireEvent.click(screen.getByRole("button", { name: "再開" }));
    expect(socket.sent).toContain(JSON.stringify({ type: "timer:resume" }));
  });

  it("非 host の snapshot idle 枠を表示し、phase:updated 後も表示を維持する", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: false,
      phase: buildPhaseStep(1),
    });

    const controls = screen.getByRole("group", { name: "ルームの操作" });
    const timer = within(controls).getByTestId("room-timer");
    expect(timer).toBeVisible();
    expect(timer.tagName).toBe("SPAN");
    expect(timer).toHaveTextContent("03:00");
    expect(within(timer).queryByRole("button")).not.toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
      }),
    );

    expect(screen.getByText("課題整理")).toBeInTheDocument();
    expect(within(controls).getByTestId("room-timer")).toBeVisible();
    expect(within(controls).getByTestId("room-timer")).toHaveTextContent(
      "06:00",
    );
  });

  it("forbidden エラーを受信するとポップアップ通知を表示する", () => {
    const { socket } = connectWithSnapshot([], { phase: buildPhaseStep(4) });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "ホストのみ操作できます。",
      }),
    );

    expect(notifyMocks.error).toHaveBeenCalledWith("ホストのみ操作できます。");
  });

  it("投票未完了（voting-incomplete）を受信すると toast ではなく強制進行の確認を表示し、確認で force 付き phase:next を送信する", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(4),
    });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    );

    expect(notifyMocks.error).not.toHaveBeenCalled();
    expect(screen.getByText(FORCE_NEXT_PHASE_COPY.title)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: FORCE_NEXT_PHASE_COPY.confirm }),
    );

    expect(socket.sent).toContain(
      JSON.stringify({ type: "phase:next", force: true }),
    );
  });

  it("非ホストに voting-incomplete が届いた場合はダイアログを開かず toast へフォールバックする", () => {
    // サーバーの評価順では非ホストに届かないコードだが、UI 側はその暗黙の
    // 保証に依存せず通常のエラー表示へ落とすことを固定する。
    const { socket } = connectWithSnapshot([], {
      isHost: false,
      phase: buildPhaseStep(4),
    });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    );

    expect(notifyMocks.error).toHaveBeenCalledWith(
      "全員の主観・客観投票が完了していません。",
    );
    expect(
      screen.queryByText(FORCE_NEXT_PHASE_COPY.title),
    ).not.toBeInTheDocument();
  });

  it("強制進行の確認ダイアログは phase:updated の受信で閉じる", () => {
    // 別タブなど他の経路で進行が確定したら、開いていた確認は根拠が古い。
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(4),
    });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    );
    expect(screen.getByText(FORCE_NEXT_PHASE_COPY.title)).toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(5),
      }),
    );

    expect(
      screen.queryByText(FORCE_NEXT_PHASE_COPY.title),
    ).not.toBeInTheDocument();
  });

  it("強制進行の確認ダイアログは再接続の snapshot 受信で閉じる", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(4),
    });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    );
    expect(screen.getByText(FORCE_NEXT_PHASE_COPY.title)).toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        notes: [],
        members: [],
        phase: buildPhaseStep(5),
        isHost: true,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );

    expect(
      screen.queryByText(FORCE_NEXT_PHASE_COPY.title),
    ).not.toBeInTheDocument();
  });

  it("強制進行の確認をキャンセルすると force 付き phase:next は送信されない", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(4),
    });

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: FORCE_NEXT_PHASE_COPY.cancel }),
    );

    expect(socket.sent).not.toContain(
      JSON.stringify({ type: "phase:next", force: true }),
    );
    expect(
      screen.queryByText(FORCE_NEXT_PHASE_COPY.title),
    ).not.toBeInTheDocument();
  });

  it("snapshot の付箋がボードに描画される", () => {
    connectWithSnapshot([protocolNote()]);
    expect(screen.getByDisplayValue("最初の付箋")).toBeInTheDocument();
  });

  it("snapshotのマップ寸法を描画し、広さ変更をRoomDOへ送る", () => {
    const { socket } = connectWithSnapshot([], {
      phase: buildPhaseStep(2, 3),
      ideaMapSizeLevel: 2,
      ideaMapSizeInitialized: true,
    });

    expect(screen.getByTestId("idea-value-feasibility-map")).toHaveStyle({
      width: "1936px",
      height: "1089px",
    });
    fireEvent.click(screen.getByRole("button", { name: "マップを広くする" }));
    expectSent(socket, { type: "idea-map:resize", sizeLevel: 3 });
  });

  it("移動可能ステップで付箋を選択すると最前面への永続移動を送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2),
    });
    const surface = within(screen.getByTestId("note-card")).getByRole(
      "button",
      { name: "付箋" },
    );

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });

    expectSent(socket, { type: "note:bring-to-front", noteId: NOTE_ID });
  });

  it("選択中でも確定後は共有された重なり順を優先する", () => {
    const selected = protocolNote({
      id: NOTE_ID,
      content: "選択中の付箋",
      stackOrder: 1,
    });
    const other = protocolNote({
      id: TARGET_NOTE_ID,
      content: "別の参加者が選ぶ付箋",
      stackOrder: 2,
    });
    const { socket } = connectWithSnapshot([selected, other], {
      phase: buildPhaseStep(2),
    });
    const selectedCard = screen
      .getByDisplayValue("選択中の付箋")
      .closest<HTMLElement>("[data-testid='note-card']");
    const otherCard = screen
      .getByDisplayValue("別の参加者が選ぶ付箋")
      .closest<HTMLElement>("[data-testid='note-card']");
    if (!selectedCard || !otherCard) throw new Error("付箋が見つかりません");

    const surface = within(selectedCard).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(selectedCard).toHaveStyle({ zIndex: "2147483647" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...selected, stackOrder: 3 },
      }),
    );
    expect(selectedCard).toHaveAttribute("data-selected", "true");
    expect(selectedCard).toHaveStyle({ zIndex: "3" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...other, stackOrder: 4 },
      }),
    );
    expect(selectedCard).toHaveStyle({ zIndex: "3" });
    expect(otherCard).toHaveStyle({ zIndex: "4" });
  });

  it("移動不可ステップでは付箋を選択しても最前面への永続移動を送信しない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });
    const card = screen.getByTestId("note-card");
    const surface = within(card).getByRole("button", { name: "付箋" });

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(card).toHaveAttribute("data-selected", "true");
    expect(
      socket.sent.map((payload) => JSON.parse(payload)),
    ).not.toContainEqual(
      expect.objectContaining({ type: "note:bring-to-front" }),
    );
  });

  it("移動可能ステップでも個人付箋の選択では最前面への永続移動を送信しない", () => {
    const { socket } = connectWithSnapshot(
      [protocolNote({ visibility: "private", content: "個人付箋" })],
      { phase: buildPhaseStep(2) },
    );
    const toolbar = openPrivateNotesToolbar();
    const card = within(toolbar).getByTestId("note-card");
    const surface = within(card).getByRole("button", { name: "付箋" });

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(card).toHaveAttribute("data-selected", "true");
    expect(
      socket.sent.map((payload) => JSON.parse(payload)),
    ).not.toContainEqual(
      expect.objectContaining({ type: "note:bring-to-front" }),
    );
  });

  it("結果ステップのホストが付箋を決定すると note:decide を送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    fireEvent.click(
      screen.getByRole("button", { name: "採用する付箋: 最初の付箋" }),
    );

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:decide", noteId: NOTE_ID }),
    );
  });

  it("結果ステップの候補 hover・leave を adoption-focus:update として即時送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    const target = screen.getByRole("button", {
      name: "採用する付箋: 最初の付箋",
    });

    fireEvent.pointerEnter(target);
    expect(socket.sent).toContain(
      JSON.stringify({ type: "adoption-focus:update", noteId: NOTE_ID }),
    );
    fireEvent.pointerLeave(target);
    expect(socket.sent).toContain(
      JSON.stringify({ type: "adoption-focus:update", noteId: null }),
    );
  });

  it("参加者はサーバーから受けた採用フォーカスだけを点線表示する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: false,
    });

    act(() =>
      socket.simulateServerMessage({
        type: "adoption-focus:updated",
        noteId: NOTE_ID,
      }),
    );
    expect(screen.getByTestId("note-card")).toHaveClass("outline-dashed");
    expect(socket.sent).not.toContain(
      JSON.stringify({ type: "adoption-focus:update", noteId: NOTE_ID }),
    );
  });

  it("結果ステップのホストが確定を解除すると decision:clear を送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
      decision: {
        phase: 1,
        noteId: NOTE_ID,
        decidedBy: USER_ID,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "確定を解除" }));

    expect(socket.sent).toContain(JSON.stringify({ type: "decision:clear" }));
  });

  it("結果ステップのホストが右クリックメニューから候補外にし、通知のUndoで復帰する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    fireEvent.contextMenu(
      within(screen.getByTestId("note-card")).getByRole("button", {
        name: "付箋",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "候補から外す" }));

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:exclude", noteId: NOTE_ID }),
    );
    expect(notifyMocks.noteExcluded).toHaveBeenCalledTimes(1);
    const undo = notifyMocks.noteExcluded.mock.calls[0]?.[0];
    if (typeof undo !== "function") throw new Error("Undo がありません");
    undo();
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:restore", noteId: NOTE_ID }),
    );
  });

  it("復帰後の古いUndoと再除外後の一代前のUndoは別操作を巻き戻さない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    fireEvent.click(screen.getByRole("button", { name: "候補から外す" }));
    const firstUndo = notifyMocks.noteExcluded.mock.calls[0]?.[0];
    if (typeof firstUndo !== "function") throw new Error("Undo がありません");

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: protocolNote({ excluded: true }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "候補に戻す" }));
    const restoreCountAfterExplicitRestore = socket.sent.filter(
      (message) => JSON.parse(message).type === "note:restore",
    ).length;
    firstUndo();
    expect(
      socket.sent.filter(
        (message) => JSON.parse(message).type === "note:restore",
      ),
    ).toHaveLength(restoreCountAfterExplicitRestore);

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: protocolNote({ excluded: false }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "候補から外す" }));
    const secondUndo = notifyMocks.noteExcluded.mock.calls[1]?.[0];
    if (typeof secondUndo !== "function")
      throw new Error("2回目のUndoがありません");

    firstUndo();
    expect(
      socket.sent.filter(
        (message) => JSON.parse(message).type === "note:restore",
      ),
    ).toHaveLength(restoreCountAfterExplicitRestore);
    secondUndo();
    expect(
      socket.sent.filter(
        (message) => JSON.parse(message).type === "note:restore",
      ),
    ).toHaveLength(restoreCountAfterExplicitRestore + 1);
  });

  it("結果ステップの非ホストは候補外付箋の復帰操作を見られない", () => {
    connectWithSnapshot([protocolNote({ excluded: true })], {
      phase: buildPhaseStep(5),
      isHost: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.getByText("候補外")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "候補に戻す" })).toBeNull();
  });

  it("確認後に一括候補外を送り、サーバー確定の実件数とoperation IDでUndoする", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "投票なしをまとめて候補から外す（1件）",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1件を候補から外す" }));
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:bulk-exclude" }),
    );
    const operationId = "33333333-3333-4333-8333-333333333333";
    act(() =>
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "manual",
      }),
    );
    expect(notifyMocks.bulkCandidatesExcluded).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    );
    const undo = notifyMocks.bulkCandidatesExcluded.mock.calls[0]?.[1];
    if (typeof undo !== "function") throw new Error("Undo がありません");
    undo();
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:bulk-restore", operationId }),
    );
  });

  it("新しい一括操作の確定後は古いUndoを無視し、0件では通知しない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    const firstOperationId = "33333333-3333-4333-8333-333333333333";
    const secondOperationId = "44444444-4444-4444-8444-444444444444";
    act(() => {
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId: firstOperationId,
        count: 1,
        source: "manual",
      });
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId: secondOperationId,
        count: 2,
        source: "manual",
      });
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId: "55555555-5555-4555-8555-555555555555",
        count: 0,
        source: "manual",
      });
    });
    expect(notifyMocks.bulkCandidatesExcluded).toHaveBeenCalledTimes(2);
    const firstUndo = notifyMocks.bulkCandidatesExcluded.mock.calls[0]?.[1];
    const secondUndo = notifyMocks.bulkCandidatesExcluded.mock.calls[1]?.[1];
    if (typeof firstUndo !== "function" || typeof secondUndo !== "function") {
      throw new Error("Undo がありません");
    }
    firstUndo();
    expect(socket.sent).not.toContain(
      JSON.stringify({
        type: "note:bulk-restore",
        operationId: firstOperationId,
      }),
    );
    secondUndo();
    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:bulk-restore",
        operationId: secondOperationId,
      }),
    );
  });

  it("自動整理を全参加者へ案内し、まとめて戻す操作はホストだけに渡す", () => {
    const operationId = "33333333-3333-4333-8333-333333333333";
    const host = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });

    act(() =>
      host.socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "phase-transition",
      }),
    );

    expect(notifyMocks.automaticallyExcludedCandidates).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    );
    const undo = notifyMocks.automaticallyExcludedCandidates.mock.calls[0]?.[1];
    if (typeof undo !== "function") throw new Error("Undo がありません");
    undo();
    expect(host.socket.sent).toContain(
      JSON.stringify({ type: "note:bulk-restore", operationId }),
    );

    notifyMocks.automaticallyExcludedCandidates.mockReset();
    const member = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: false,
    });
    act(() =>
      member.socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "phase-transition",
      }),
    );

    expect(notifyMocks.automaticallyExcludedCandidates).toHaveBeenCalledWith(
      1,
      undefined,
    );
  });

  it("note:inserted で付箋が追加される", () => {
    const { socket } = connectWithSnapshot([]);
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ content: "あとから届いた付箋" }),
      }),
    );
    expect(screen.getByDisplayValue("あとから届いた付箋")).toBeInTheDocument();
  });

  it("移動の確定応答後は選択中でも永続順へ戻る", () => {
    const dragged = protocolNote({
      content: "移動する付箋",
      stackOrder: 1,
      x: 100,
      y: 100,
    });
    const other = protocolNote({
      id: TARGET_NOTE_ID,
      content: "手前の付箋",
      stackOrder: 9,
      x: 120,
      y: 120,
    });
    const { socket } = connectWithSnapshot([dragged, other], {
      phase: buildPhaseStep(2),
    });
    const scroller = screen.getByTestId("board-canvas").parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 600,
        width: 600,
        height: 600,
      }),
    });
    const draggedCard = screen
      .getByDisplayValue("移動する付箋")
      .closest("[data-testid='note-card']");
    if (!(draggedCard instanceof HTMLElement)) {
      throw new Error("移動対象の付箋がありません");
    }
    const surface = within(draggedCard).getByRole("button", { name: "付箋" });
    const root = screen.getByTestId("room-board-view-root");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    });
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 220,
      clientY: 240,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 220,
      clientY: 240,
    });

    const move = socket.sent
      .map((payload) => JSON.parse(payload) as Record<string, unknown>)
      .find((message) => message.type === "note:drag:end");
    expect(move).toMatchObject({
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: expect.not.objectContaining({ x: dragged.x, y: dragged.y }),
    });
    expect(
      screen
        .getByDisplayValue("移動する付箋")
        .closest("[data-testid='note-card']"),
    ).toHaveStyle({ zIndex: "2147483647" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...other, content: "無関係な更新" },
      }),
    );
    expect(
      screen
        .getByDisplayValue("移動する付箋")
        .closest("[data-testid='note-card']"),
    ).toHaveStyle({ zIndex: "2147483647" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: {
          ...dragged,
          ...(move?.position as { x: number; y: number }),
          stackOrder: 10,
        },
      }),
    );
    expect(
      screen
        .getByDisplayValue("移動する付箋")
        .closest("[data-testid='note-card']"),
    ).toHaveStyle({ zIndex: "10" });

    fireEvent.pointerDown(screen.getByTestId("board-canvas"), { button: 0 });
    expect(
      screen
        .getByDisplayValue("移動する付箋")
        .closest("[data-testid='note-card']"),
    ).toHaveStyle({ zIndex: "10" });
  });

  it("個人付箋をボードへドラッグすると侵入時に公開し、ドロップで位置を確定する", () => {
    const privateNote = protocolNote({
      visibility: "private",
      content: "公開前のメモ",
    });
    const { socket } = connectWithSnapshot([privateNote], {
      phase: buildPhaseStep(2, 1),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });

    const toolbar = openPrivateNotesToolbar();
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 605, clientY: 25 });
    expect(
      within(toolbar).queryByRole("button", { name: "付箋" }),
    ).toBeInTheDocument();
    const root = screen.getByTestId("room-board-view-root");
    expect(root).toHaveClass("cursor-grabbing");
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 120, clientY: 140 });
    expect(within(toolbar).queryByRole("button", { name: "付箋" })).toBeNull();
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });
    expect(root).not.toHaveClass("cursor-grabbing");

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:publish", noteId: NOTE_ID, x: 120, y: 140 }),
    );
    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: { x: 140, y: 160 },
    });
  });

  it("共有応答でマイ付箋が消えても、同じポインター操作で移動・ドロップできる", () => {
    const privateNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([privateNote], {
      phase: buildPhaseStep(2, 1),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });

    const toolbar = openPrivateNotesToolbar();
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 605, clientY: 25 });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 100, clientY: 120 });

    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "shared", x: 100, y: 120 }),
      }),
    );

    fireEvent.pointerMove(root, { pointerId: 1, clientX: 180, clientY: 200 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 200, clientY: 220 });

    expectSent(socket, {
      type: "note:drag:move",
      noteId: NOTE_ID,
      x: 100,
      y: 120,
    });
    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: { x: 200, y: 220 },
    });
  });

  it("マイ付箋からボードへ公開した同じポインター操作で、マイ付箋へ戻せる", () => {
    const privateNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([privateNote], {
      phase: buildPhaseStep(2, 1),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });

    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 700, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 705, clientY: 105 });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 120, clientY: 140 });

    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "shared", x: 120, y: 140 }),
      }),
    );

    fireEvent.pointerMove(root, { pointerId: 1, clientX: 650, clientY: 120 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 650, clientY: 120 });

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:publish", noteId: NOTE_ID, x: 120, y: 140 }),
    );
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:unpublish", noteId: NOTE_ID }),
    );
    expect(socket.sent).not.toContainEqual(
      expect.stringContaining('"type":"note:drag:end"'),
    );
  });

  it("マイ付箋からボード→マイ付箋→再びボードへ、一回のドラッグで往復できる", () => {
    const privateNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([privateNote], {
      phase: buildPhaseStep(2, 1),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });

    // 1) ツールバーからドラッグ開始
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 700, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 705, clientY: 105 });

    // 2) ボードへ入る → publish
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 120, clientY: 140 });

    // サーバー応答: shared として追加
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "shared", x: 120, y: 140 }),
      }),
    );

    // 3) ツールバーへ戻す → unpublish
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 650, clientY: 120 });

    // サーバー応答: 削除 → private として戻る
    act(() =>
      socket.simulateServerMessage({ type: "note:deleted", noteId: NOTE_ID }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "private" }),
      }),
    );

    // 4) 再びボードへ入る → 2回目の publish
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 200, clientY: 200 });

    // 5) ボード上でドロップ
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 200, clientY: 200 });

    // publish が2回送信されていること
    const publishMessages = socket.sent.filter((message) =>
      message.includes('"type":"note:publish"'),
    );
    expect(publishMessages).toHaveLength(2);

    // unpublish が1回送信されていること
    const unpublishMessages = socket.sent.filter((message) =>
      message.includes('"type":"note:unpublish"'),
    );
    expect(unpublishMessages).toHaveLength(1);

    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: { x: 200, y: 200 },
    });
  });

  it("ボード外でpointercancelされたマイ付箋は公開せず、後続イベントも無視する", () => {
    const privateNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([privateNote]);
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });

    const toolbar = openPrivateNotesToolbar();
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 605, clientY: 25 });
    fireEvent.pointerCancel(root, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 100, clientY: 120 });

    expect(socket.sent).not.toContainEqual(
      expect.stringContaining('"type":"note:publish"'),
    );
  });

  it("自分の共有付箋をマイ付箋領域へドラッグすると非公開に戻し、note:moveを送らない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });

    const note = screen.getByTestId("note-card");
    const surface = within(note).getByRole("button", {
      name: "付箋",
      hidden: true,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 620, clientY: 120 });

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:unpublish", noteId: NOTE_ID }),
    );
    expect(socket.sent).not.toContainEqual(
      expect.stringContaining('"type":"note:drag:end"'),
    );
  });

  it("共有付箋をマイ付箋領域へ入れた瞬間に、サーバー応答を待たずリストへ表示を切り替える", () => {
    connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });

    const canvas = screen.getByTestId("board-canvas");
    const note = within(canvas).getByTestId("note-card");
    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });

    expect(within(toolbar).getByTestId("note-card")).toBeInTheDocument();
    expect(within(canvas).queryByTestId("note-card")).not.toBeInTheDocument();
  });

  it.each([
    {
      position: "先頭",
      clientY: 100,
      expected: [NOTE_ID, TARGET_NOTE_ID, STICKER_ID, THIRD_PRIVATE_NOTE_ID],
    },
    {
      position: "付箋間",
      clientY: 250,
      expected: [TARGET_NOTE_ID, NOTE_ID, STICKER_ID, THIRD_PRIVATE_NOTE_ID],
    },
    {
      position: "末尾",
      clientY: 570,
      expected: [TARGET_NOTE_ID, STICKER_ID, THIRD_PRIVATE_NOTE_ID, NOTE_ID],
    },
  ])("実際のマイ付箋UIで共有付箋を縦方向の$positionへ戻すと表示順を維持する", ({
    clientY,
    expected,
  }) => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({
          id: NOTE_ID,
          content: "戻す付箋",
          visibility: "shared",
          createdAt: "2026-01-04T00:00:00.000Z",
        }),
        protocolNote({
          id: TARGET_NOTE_ID,
          content: "マイ付箋1",
          visibility: "private",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        protocolNote({
          id: STICKER_ID,
          content: "マイ付箋2",
          visibility: "private",
          createdAt: "2026-01-02T00:00:00.000Z",
        }),
        protocolNote({
          id: THIRD_PRIVATE_NOTE_ID,
          content: "マイ付箋3",
          visibility: "private",
          createdAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
      { phase: buildPhaseStep(2, 1) },
    );
    const toolbar = openPrivateNotesToolbar();
    mockPrivateToolbarLayout(toolbar);

    const canvas = screen.getByTestId("board-canvas");
    const note = within(canvas).getByTestId("note-card");
    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 750,
      clientY,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 750,
      clientY,
    });

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:unpublish", noteId: NOTE_ID }),
    );
    expect(privateNoteIds(toolbar)).toEqual(expected);
  });

  it("受理済みの共有 drag を toolbar へ戻すと unpublish 後にカーソルを解除し、別付箋の drag を開始できる", () => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({ id: NOTE_ID, content: "戻す付箋" }),
        protocolNote({
          id: TARGET_NOTE_ID,
          content: "次に動かす付箋",
          x: 340,
        }),
      ],
      { phase: buildPhaseStep(2, 1) },
    );
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 600,
        top: 0,
        right: 900,
        bottom: 600,
        width: 300,
        height: 600,
      }),
    });
    const scroller = screen.getByTestId("board-scroller");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 400,
        width: 500,
        height: 400,
      }),
    });
    const root = screen.getByTestId("room-board-view-root");
    const firstCard = within(screen.getByTestId("board-canvas"))
      .getAllByTestId("note-card")
      .find((card) => card.dataset.noteId === NOTE_ID);
    if (!firstCard) throw new Error("最初の付箋がありません");

    const firstSurface = within(firstCard).getByRole("button", {
      name: "付箋",
    });
    fireEvent.pointerDown(firstSurface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(firstSurface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerLeave(scroller, {
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });

    const sent = socket.sent.map((payload) => JSON.parse(payload)) as Array<{
      type?: string;
      noteId?: string;
      dragId?: string;
    }>;
    const unpublishIndex = sent.findIndex(
      (message) =>
        message.type === "note:unpublish" && message.noteId === NOTE_ID,
    );
    const cursorLeaveIndex = sent.findIndex(
      (message, index) => index > 0 && message.type === "cursor:leave",
    );
    expect(unpublishIndex).toBeGreaterThanOrEqual(0);
    expect(cursorLeaveIndex).toBeGreaterThan(unpublishIndex);

    const secondCard = within(screen.getByTestId("board-canvas"))
      .getAllByTestId("note-card")
      .find((card) => card.dataset.noteId === TARGET_NOTE_ID);
    if (!secondCard) throw new Error("次の付箋がありません");
    const secondSurface = within(secondCard).getByRole("button", {
      name: "付箋",
    });
    fireEvent.pointerDown(secondSurface, {
      pointerId: 2,
      clientX: 350,
      clientY: 100,
    });
    fireEvent.pointerMove(secondSurface, {
      pointerId: 2,
      clientX: 360,
      clientY: 110,
    });

    const dragStarts = socket.sent
      .map(
        (payload) => JSON.parse(payload) as { type?: string; noteId?: string },
      )
      .filter((message) => message.type === "note:drag:start");
    expect(dragStarts.map(({ noteId }) => noteId)).toEqual([
      NOTE_ID,
      TARGET_NOTE_ID,
    ]);
  });

  it("ドロップ後に新しいマイ付箋が追加されても、既存の表示順と末尾追加を維持する", () => {
    connectWithSnapshot(
      [
        protocolNote({
          id: NOTE_ID,
          content: "戻す付箋",
          visibility: "shared",
          createdAt: "2026-01-04T00:00:00.000Z",
        }),
        protocolNote({
          id: TARGET_NOTE_ID,
          content: "マイ付箋1",
          visibility: "private",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        protocolNote({
          id: STICKER_ID,
          content: "マイ付箋2",
          visibility: "private",
          createdAt: "2026-01-02T00:00:00.000Z",
        }),
        protocolNote({
          id: THIRD_PRIVATE_NOTE_ID,
          content: "マイ付箋3",
          visibility: "private",
          createdAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
      { phase: buildPhaseStep(2, 1) },
    );
    const toolbar = openPrivateNotesToolbar();
    mockPrivateToolbarLayout(toolbar);

    const canvas = screen.getByTestId("board-canvas");
    const note = within(canvas).getByTestId("note-card");
    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 750,
      clientY: 250,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 750,
      clientY: 250,
    });

    act(() =>
      FakeWebSocket.instances.at(-1)?.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({
          id: NEW_PRIVATE_NOTE_ID,
          content: "新しいマイ付箋",
          visibility: "private",
          createdAt: "2026-01-05T00:00:00.000Z",
        }),
      }),
    );

    expect(privateNoteIds(toolbar)).toEqual([
      TARGET_NOTE_ID,
      NOTE_ID,
      STICKER_ID,
      THIRD_PRIVATE_NOTE_ID,
      NEW_PRIVATE_NOTE_ID,
    ]);
  });

  it("自分の共有付箋をマイ付箋領域へドラッグして非公開に戻し、さらに再びボードへドラッグして公開しドロップ位置を確定できる", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 500, bottom: 400 }),
    });

    // 1) ボードからドラッグ開始し、ツールバーへ持っていく
    const note = screen.getByTestId("note-card");
    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });

    // サーバー応答: 削除 → private として戻る
    act(() =>
      socket.simulateServerMessage({ type: "note:deleted", noteId: NOTE_ID }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "private" }),
      }),
    );

    // 2) もう一度ボードへ持っていく
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    });

    // サーバー応答: shared として追加
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "shared", x: 150, y: 150 }),
      }),
    );

    // 3) ドロップして確定する
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 160, clientY: 160 });

    // unpublish が送られたこと
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:unpublish", noteId: NOTE_ID }),
    );

    // 2回目の publish が送られたこと
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:publish", noteId: NOTE_ID, x: 140, y: 140 }),
    );

    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: { x: 150, y: 150 },
    });
  });

  it("他メンバーの付箋をマイ付箋領域へドラッグしても非公開に戻せない", () => {
    const { socket } = connectWithSnapshot([
      protocolNote({ authorId: OTHER_USER_ID }),
    ]);
    const toolbar = openPrivateNotesToolbar();
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });

    const note = screen.getByTestId("note-card");
    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    expect(toolbar).not.toHaveAttribute("data-return-drop-target");
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });

    expect(socket.sent).not.toContainEqual(
      expect.stringContaining('"type":"note:unpublish"'),
    );
  });

  it("note:updated で本文が置き換わる", () => {
    const { socket } = connectWithSnapshot([protocolNote()]);
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: protocolNote({ content: "更新後の本文" }),
      }),
    );
    expect(screen.getByDisplayValue("更新後の本文")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("最初の付箋")).not.toBeInTheDocument();
  });

  it("note:deleted で付箋が消える", () => {
    const { socket } = connectWithSnapshot([protocolNote()]);
    act(() =>
      socket.simulateServerMessage({ type: "note:deleted", noteId: NOTE_ID }),
    );
    expect(screen.queryByDisplayValue("最初の付箋")).not.toBeInTheDocument();
  });

  it("error メッセージはクラッシュせず警告ログに残る", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { socket } = connectWithSnapshot([]);
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "この操作を行う権限がありません。",
      }),
    );
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("forbidden"),
    );
  });
});

describe("接続状態 → 画面反映", () => {
  it("接続確立前は接続中の表示になる（loading）", () => {
    renderBoard({ open: false });

    expect(screen.getByRole("status")).toHaveTextContent("接続中");
  });

  it("接続が確立するとインジケータが消える（success）", () => {
    renderBoard();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("予期しない切断で再接続中の表示になる（error）", () => {
    const { socket } = connectWithSnapshot([]);

    act(() => socket.simulateUnexpectedClose());

    expect(screen.getByRole("status")).toHaveTextContent("再接続");
  });

  it("解散による WS close で理由を通知して /home へ router.replace する", () => {
    const { socket } = connectWithSnapshot([]);
    act(() => socket.simulateDisbandedClose());
    expect(notifyMocks.roomDisbanded).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/home");
    // 再接続メッセージは出さない
    expect(screen.queryByText(/再接続/)).not.toBeInTheDocument();
  });
});

describe("ユーザー操作 → プロトコルメッセージ送信", () => {
  it("「付箋を追加」で note:create が送信される（楽観挿入はしない）", () => {
    const { socket } = connectWithSnapshot([]);

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(socket.sent).toContain(JSON.stringify({ type: "note:create" }));
    // 確定（note:inserted）が届くまでは描画されない。
    expect(screen.queryAllByTestId("note-card")).toHaveLength(0);
  });

  it("主観シールを付箋へドロップすると、操作IDつき座標投票が送信される", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    dropPaletteSticker("subjective");

    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual(
      expect.objectContaining({
        type: "note:vote-sticker:add",
        noteId: NOTE_ID,
        kind: "subjective",
        stickerId: expect.any(String),
        x: 0.25,
        y: 0.5,
        operationId: expect.any(String),
      }),
    );
  });

  it("客観シールを付箋へドロップすると、操作IDつき座標投票が送信される", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    dropPaletteSticker("objective");

    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual(
      expect.objectContaining({
        type: "note:vote-sticker:add",
        noteId: NOTE_ID,
        kind: "objective",
        stickerId: expect.any(String),
        x: 0.25,
        y: 0.5,
        operationId: expect.any(String),
      }),
    );
  });

  it("客観ドットはサーバー応答前でも残数までしか送信しない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });
    dropPaletteSticker("objective");
    dropPaletteSticker("objective");
    dropPaletteSticker("objective");
    dropPaletteSticker("objective");

    expect(
      socket.sent.filter(
        (message) => JSON.parse(message).type === "note:vote-sticker:add",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "客観シール 残り0票" }),
    ).toBeDisabled();
  });

  it("客観シール更新のサーバー反映で、保留中の自分の主観シールを外さない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    dropPaletteSticker("subjective");
    dropPaletteSticker("objective");

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
        }),
      }),
    );

    expect(screen.getByRole("img", { name: "主観シール 1票" })).toHaveAttribute(
      "data-state",
      "pending",
    );
  });

  it("自分の客観シールを1票取り消すと note:vote-remove が送信される", () => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 2, votedByMe: true, ownCount: 2 },
          },
        }),
      ],
      {
        phase: buildPhaseStep(4),
      },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "客観シール 2票を1票取り消す" }),
    );

    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual(
      expect.objectContaining({
        type: "note:vote-remove",
        noteId: NOTE_ID,
        kind: "objective",
        operationId: expect.any(String),
      }),
    );
  });

  it("付箋上の個別シールをクリックすると stickerId 指定の削除が送信される", () => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
          dotVoteStickers: [
            { id: STICKER_ID, kind: "objective", x: 0.25, y: 0.5 },
          ],
        }),
      ],
      { phase: buildPhaseStep(4) },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "客観シール 1票を1票取り消す" }),
    );

    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual(
      expect.objectContaining({
        type: "note:vote-sticker:remove",
        stickerId: STICKER_ID,
        operationId: expect.any(String),
      }),
    );
  });

  it("自分のシールをパレットへ戻すと削除を送り、確定後に残票が戻る", () => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
          dotVoteStickers: [
            { id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 },
          ],
        }),
      ],
      { phase: buildPhaseStep(4) },
    );
    const sticker = screen.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    const palette = screen.getByRole("region", { name: "投票パレット" });
    const root = screen.getByTestId("room-board-view-root");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => palette,
    });

    fireEvent.pointerDown(sticker, {
      pointerId: 21,
      clientX: 140,
      clientY: 145,
    });
    fireEvent.pointerMove(root, {
      pointerId: 21,
      clientX: 320,
      clientY: 700,
    });
    fireEvent.pointerUp(root, {
      pointerId: 21,
      clientX: 320,
      clientY: 700,
    });

    const removeMessage = JSON.parse(socket.sent.at(-1) ?? "{}");
    expect(removeMessage).toEqual(
      expect.objectContaining({
        type: "note:vote-sticker:remove",
        stickerId: STICKER_ID,
        operationId: expect.any(String),
      }),
    );
    expect(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
    ).toBeEnabled();

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: removeMessage.operationId,
        note: protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 0, votedByMe: false, ownCount: 0 },
          },
          dotVoteStickers: [],
        }),
      }),
    );

    expect(
      screen.queryByRole("button", { name: "客観シール 1票を1票取り消す" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
    ).toBeEnabled();
  });

  it("投票中は付箋上のシールを別の付箋へドラッグすると移動が送信される", () => {
    const { socket } = connectWithSnapshot(
      [
        protocolNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
          dotVoteStickers: [
            { id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 },
          ],
        }),
        protocolNote({
          id: TARGET_NOTE_ID,
          content: "移動先の付箋",
          x: 400,
        }),
      ],
      { phase: buildPhaseStep(4) },
    );
    const [, target] = screen.getAllByTestId("note-card");
    if (!target) throw new Error("移動先の付箋が見つかりません");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 400,
      y: 100,
      top: 100,
      right: 600,
      bottom: 250,
      left: 400,
      width: 200,
      height: 150,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => target,
    });

    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "客観シール 1票を1票取り消す",
      }),
      { pointerId: 12, clientX: 140, clientY: 145 },
    );
    fireEvent.pointerMove(root, {
      pointerId: 12,
      clientX: 450,
      clientY: 175,
    });
    fireEvent.pointerUp(root, {
      pointerId: 12,
      clientX: 450,
      clientY: 175,
    });

    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual(
      expect.objectContaining({
        type: "note:vote-sticker:move",
        stickerId: STICKER_ID,
        noteId: TARGET_NOTE_ID,
        x: 0.25,
        y: 0.5,
        operationId: expect.any(String),
      }),
    );
  });

  it("操作IDつきエラーを受けると楽観的なシールを戻し、失敗理由を表示する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    dropPaletteSticker("subjective");
    const operationId = JSON.parse(socket.sent.at(-1) ?? "{}").operationId;

    expect(
      screen.getByRole("img", { name: "主観シール 1票" }),
    ).toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "この投票は受け付けられません。",
        operationId,
      }),
    );

    expect(
      screen.queryByRole("img", { name: "主観シール 1票" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "主観シール 残り1票" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "この投票は受け付けられません。",
    );
    expect(notifyMocks.error).not.toHaveBeenCalled();
  });

  it("アンマウントで WebSocket を閉じる", () => {
    const { view, socket } = connectWithSnapshot([]);
    view.unmount();
    expect(socket.readyState).toBe(3);
  });

  // room-client.send() は未openだとメッセージを黙って破棄するため、
  // 未接続中は操作自体を無効化し「送ったつもりが届かない」を防ぐ。
  it("接続確立前は「付箋を追加」ボタンが無効化され、クリックしても何も送信されない", () => {
    const { socket } = renderBoard({ open: false });

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(socket.sent).toHaveLength(0);
  });

  it("予期しない切断後も「付箋を追加」ボタンが無効化され、クリックしても何も送信されない", () => {
    const { socket } = connectWithSnapshot([]);

    act(() => socket.simulateUnexpectedClose());
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(socket.sent).toHaveLength(0);
  });

  it("共有付箋のドラッグ中に切断したらローカルの pointer capture も解除する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const scroller = screen.getByTestId("board-scroller");
    const releasePointerCapture = vi.fn();
    Object.defineProperty(scroller, "releasePointerCapture", {
      configurable: true,
      value: releasePointerCapture,
    });
    const surface = within(screen.getByTestId("board-canvas")).getByRole(
      "button",
      { name: "付箋" },
    );

    fireEvent.pointerDown(surface, {
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 7,
      clientX: 110,
      clientY: 110,
    });
    expectSent(socket, { type: "note:drag:start", noteId: NOTE_ID });

    act(() => socket.simulateUnexpectedClose());

    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("ホストが確認後に「次のステップへ」を実行すると phase:next が送信される", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(1),
    });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    expect(screen.getByText("次のステップへ進みますか？")).toBeInTheDocument();

    expect(socket.sent).not.toContain(JSON.stringify({ type: "phase:next" }));

    fireEvent.click(screen.getByRole("button", { name: "移行する" }));

    expect(socket.sent).toContain(JSON.stringify({ type: "phase:next" }));
  });
});

describe("Step 2-1（HMW 個人執筆）", () => {
  function connectAtHmwStep(notes: ProtocolNote[] = []) {
    return connectWithSnapshot(notes, {
      phase: buildPhaseStep(1, 2),
      carryovers: [buildCarryover({ content: "宿題を後回しにしてしまう" })],
      groups:
        notes.length >= 2
          ? [
              buildGroup({
                name: "フェーズ1のグループ",
                noteIds: notes.map((note) => note.id),
              }),
            ]
          : undefined,
    });
  }

  it("持ち越された決定課題を表示する", () => {
    connectAtHmwStep();

    expect(screen.getByText(DECIDED_ISSUE_LABEL)).toBeInTheDocument();
    expect(screen.getByText("宿題を後回しにしてしまう")).toBeInTheDocument();
  });

  it("テンプレートを選ぶと content 付き note:create を送る", () => {
    const { socket } = connectAtHmwStep();

    fireEvent.click(screen.getByRole("button", { name: HMW_TEMPLATES[0] }));

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "note:create",
      content: HMW_TEMPLATES[0],
    });
  });

  it("「付箋を追加」は content なしの note:create を送る（イベントを content に流さない）", () => {
    const { socket } = connectAtHmwStep();

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    console.log(socket.sent.map((raw) => JSON.parse(raw)));

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "note:create",
    });
  });

  it("Step 2-1 ではフェーズ1の共有付箋・グループをボードに描画しない", () => {
    connectAtHmwStep([
      protocolNote({ content: "フェーズ1の共有付箋", visibility: "shared" }),
      protocolNote({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        content: "フェーズ1の共有付箋2",
        visibility: "shared",
      }),
    ]);

    expect(
      screen.queryByDisplayValue("フェーズ1の共有付箋"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("フェーズ1のグループ")).not.toBeInTheDocument();
  });

  it("Step 1-1 では HMW テンプレートパネルを表示しない", () => {
    connectWithSnapshot([], { phase: buildPhaseStep(1) });

    expect(screen.queryByTestId("hmw-template-panel")).not.toBeInTheDocument();
  });

  it("フェーズ1では持ち越しが届いていても決定課題バナーを掲示しない", () => {
    // 現サーバーはフェーズ1の snapshot に carryovers を入れないが、
    // 「掲示はフェーズ2の間だけ」というクライアント側ポリシーを固定する。
    connectWithSnapshot([], {
      phase: buildPhaseStep(1),
      carryovers: [buildCarryover()],
    });

    expect(screen.queryByText("決定した課題")).not.toBeInTheDocument();
  });
});

describe("Step 3-1（アイデア個人執筆）", () => {
  it("フェーズ1とフェーズ2で決定した内容を両方表示する", () => {
    connectWithSnapshot([], {
      phase: buildPhaseStep(1, 3),
      carryovers: [
        buildCarryover({ phase: 1, content: "優先順位を決められない" }),
        buildCarryover({ phase: 2, content: "どうすれば着手しやすくできるか" }),
      ],
    });

    fireEvent.click(screen.getByText("決定した課題"));
    expect(screen.getByText("優先順位を決められない")).toBeInTheDocument();
    expect(
      screen.getByText("どうすれば着手しやすくできるか"),
    ).toBeInTheDocument();
  });

  it("発想のヒントを選ぶと文言つき note:create を送る", () => {
    const { socket } = connectWithSnapshot([], {
      phase: buildPhaseStep(1, 3),
    });

    fireEvent.click(screen.getByRole("button", { name: "もっと簡単に" }));

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "note:create",
      content: "もっと簡単に",
    });
  });
});

describe("Step 3-2〜3-5（2軸マッピング）", () => {
  it("Step3-3のパン・ズームはカメラだけを変更し、付箋座標を送信しない", async () => {
    const { socket } = connectWithSnapshot([protocolNote({ x: 25, y: 75 })], {
      phase: buildPhaseStep(3, 3),
    });
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
    const world = screen.getByTestId("board-canvas");
    expect(world).toContainElement(plane);
    fireEvent.pointerDown(plane, {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(screen.getByTestId("board-scroller"), {
      pointerId: 7,
      clientX: 160,
      clientY: 130,
    });
    fireEvent.pointerUp(screen.getByTestId("board-scroller"), { pointerId: 7 });
    await waitFor(() =>
      expect(world.style.transform).toBe("translate3d(60px, 30px, 0) scale(1)"),
    );
    fireEvent.click(screen.getByRole("button", { name: "キャンバスを拡大" }));
    await waitFor(() => expect(world.style.transform).toContain("scale(1.25)"));
    const surface = within(plane).getByRole("button", { name: "付箋" });
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.pointerDown(surface, {
      button: 0,
      pointerId: 8,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 8,
      clientX: 160,
      clientY: 130,
    });
    fireEvent.pointerUp(surface, { pointerId: 8 });
    fireEvent.keyUp(window, { code: "Space" });
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter(
          (m) => m.type === "note:drag:move" || m.type === "note:drag:end",
        ),
    ).toEqual([]);
  });
  it.each([
    2, 3,
  ])("Step 3-%iでは付箋だけを移動し、カメラを動かさない", (step) => {
    const { socket } = connectWithSnapshot([protocolNote({ x: 25, y: 75 })], {
      phase: buildPhaseStep(step, 3),
    });
    const canvas = screen.getByTestId("board-canvas");
    const cameraBefore = canvas.style.transform;
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 600,
        width: 600,
        height: 600,
      }),
    });
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
    Object.defineProperty(plane, "getBoundingClientRect", {
      value: () => ({
        left: 100,
        top: 100,
        right: 500,
        bottom: 500,
        width: 400,
        height: 400,
      }),
    });

    const mappedNote = within(plane).getByTestId(
      "idea-value-feasibility-map-note-cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(mappedNote).toHaveStyle({
      transform: "none",
    });
    const note = within(mappedNote).getByTestId("note-card");

    const surface = within(note).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 310,
      clientY: 310,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 310,
      clientY: 310,
    });

    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: { x: 50, y: 50 },
    });
    expect(canvas.style.transform).toBe(cameraBefore);
  });

  it("Step 3-2でマイ付箋を2軸マップへ共有し、正規化した位置で公開する", () => {
    const privateNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([privateNote], {
      phase: buildPhaseStep(2, 3),
    });
    const canvas = screen.getByTestId("board-canvas");
    const scroller = canvas.parentElement;
    if (!scroller) throw new Error("ボードスクローラーがありません");
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 600,
        width: 600,
        height: 600,
      }),
    });
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
    Object.defineProperty(plane, "getBoundingClientRect", {
      value: () => ({
        left: 100,
        top: 100,
        right: 500,
        bottom: 500,
        width: 400,
        height: 400,
      }),
    });

    const toolbar = openPrivateNotesToolbar();
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    Object.defineProperty(handle, "getBoundingClientRect", {
      value: () => ({
        left: 500,
        top: 0,
        right: 700,
        bottom: 150,
        width: 200,
        height: 150,
      }),
    });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 600,
      clientY: 20,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 605,
      clientY: 25,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 1,
      clientX: 300,
      clientY: 300,
    });

    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      type: "note:publish",
      noteId: NOTE_ID,
      x: 50,
      y: 50,
    });
  });

  it.each([
    4, 5,
  ])("Step 3-%iではマップ上の付箋をドラッグしても移動メッセージを送らない", (step) => {
    const { socket } = connectWithSnapshot([protocolNote({ x: 25, y: 75 })], {
      phase: buildPhaseStep(step, 3),
    });
    const note = within(
      screen.getByTestId("idea-value-feasibility-map-plane"),
    ).getByTestId("note-card");
    const surface = within(note).getByRole("button", {
      name: "付箋",
      hidden: true,
    });

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });

    expect(
      socket.sent.map((payload) => JSON.parse(payload).type),
    ).not.toContain("note:drag:move");
    expect(
      socket.sent.map((payload) => JSON.parse(payload).type),
    ).not.toContain("note:drag:end");
  });
});
