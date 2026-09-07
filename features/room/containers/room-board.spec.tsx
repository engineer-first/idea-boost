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

import type { PersistentGroup } from "@/contracts/grouping";
import type { RoomPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { Carryover, ProtocolNote } from "@/contracts/room-protocol";
import { buildCarryover, buildGroup } from "@/contracts/room-protocol.fixture";
import {
  DECIDED_ISSUE_LABEL,
  HMW_HEADING,
  HMW_TEMPLATES,
} from "@/features/hmw";
import { FORCE_NEXT_PHASE_COPY } from "../molecules/force-next-phase-dialog";
import { RoomBoard } from "./room-board";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

function protocolNote(overrides?: Partial<ProtocolNote>): ProtocolNote {
  return {
    id: NOTE_ID,
    authorId: USER_ID,
    content: "最初の付箋",
    visibility: "shared",
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
      decision: null,
      carryovers: options?.carryovers ?? [],
      groups: options?.groups,
      timer: { status: "idle" },
      serverNow: Date.now(),
    }),
  );

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

  it("結果ステップのホストが付箋を決定すると note:decide を送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    const card = screen.getByTestId("note-card");
    const surface = within(card).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "この付箋を取り組む課題に決定",
      }),
    );

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:decide", noteId: NOTE_ID }),
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 605, clientY: 25 });
    expect(
      within(toolbar).queryByRole("button", { name: "付箋" }),
    ).toBeInTheDocument();
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 120, clientY: 140 });
    expect(within(toolbar).queryByRole("button", { name: "付箋" })).toBeNull();
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:publish", noteId: NOTE_ID, x: 120, y: 140 }),
    );
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:move", noteId: NOTE_ID, x: 140, y: 160 }),
    );
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
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

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:drag", noteId: NOTE_ID, x: 100, y: 120 }),
    );
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:move", noteId: NOTE_ID, x: 200, y: 220 }),
    );
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
    const toolbar = screen.getByTestId("private-notes-toolbar");
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
      expect.stringContaining('"type":"note:move"'),
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
    const toolbar = screen.getByTestId("private-notes-toolbar");
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

    // 最終的に note:move でドロップ位置を確定していること
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:move", noteId: NOTE_ID, x: 200, y: 200 }),
    );
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
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
    const toolbar = screen.getByTestId("private-notes-toolbar");
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
      expect.stringContaining('"type":"note:move"'),
    );
  });

  it("共有付箋をマイ付箋領域へ入れた瞬間に、サーバー応答を待たずリストへ表示を切り替える", () => {
    connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const toolbar = screen.getByTestId("private-notes-toolbar");
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

  it("自分の共有付箋をマイ付箋領域へドラッグして非公開に戻し、さらに再びボードへドラッグして公開しドロップ位置を確定できる", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
    });
    const toolbar = screen.getByTestId("private-notes-toolbar");
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

    // 最終的に note:move で確定すること
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:move", noteId: NOTE_ID, x: 150, y: 150 }),
    );
  });

  it("他メンバーの付箋をマイ付箋領域へドラッグしても非公開に戻せない", () => {
    const { socket } = connectWithSnapshot([
      protocolNote({ authorId: OTHER_USER_ID }),
    ]);
    const toolbar = screen.getByTestId("private-notes-toolbar");
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

  it("付箋の主観ドットボタンで note:vote が送信される", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    screen.debug();

    fireEvent.click(screen.getByRole("button", { name: "主観ドットを投票" }));

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:vote",
        noteId: NOTE_ID,
        kind: "subjective",
      }),
    );
  });

  it("付箋の客観ドットボタンで note:vote が送信される", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    fireEvent.click(screen.getByRole("button", { name: "客観ドットを追加" }));

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:vote",
        noteId: NOTE_ID,
        kind: "objective",
      }),
    );
  });

  it("客観ドットはサーバー応答前でも残数までしか送信しない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });
    const button = screen.getByRole("button", { name: "客観ドットを追加" });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(
      socket.sent.filter(
        (message) =>
          message ===
          JSON.stringify({
            type: "note:vote",
            noteId: NOTE_ID,
            kind: "objective",
          }),
      ),
    ).toHaveLength(3);
    expect(screen.getByText("客観 残り0")).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("客観ドット更新のサーバー反映でローカル選択済みの主観ドットを外さない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(4),
    });

    fireEvent.click(screen.getByRole("button", { name: "主観ドットを投票" }));
    fireEvent.click(screen.getByRole("button", { name: "客観ドットを追加" }));

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

    expect(
      screen.getByRole("button", { name: "主観ドット投票を取り消す" }),
    ).toHaveTextContent("主観1");
  });

  it("付箋の客観ドットリセットボタンで note:vote-reset が送信される", () => {
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
      screen.getByRole("button", { name: "客観ドットを0に戻す" }),
    );

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:vote-reset",
        noteId: NOTE_ID,
        kind: "objective",
      }),
    );
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

  it("持ち越された決定課題と HMW 見出しが表示される", () => {
    connectAtHmwStep();

    expect(screen.getByText(DECIDED_ISSUE_LABEL)).toBeInTheDocument();
    expect(screen.getByText("宿題を後回しにしてしまう")).toBeInTheDocument();
    expect(screen.getByText(HMW_HEADING)).toBeInTheDocument();
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

    expect(
      screen.queryByTestId("hmw-decided-issue-banner"),
    ).not.toBeInTheDocument();
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
        .filter((m) => m.type === "note:move" || m.type === "note:drag"),
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

    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      type: "note:move",
      noteId: NOTE_ID,
      x: 50,
      y: 50,
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
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

    expect(socket.sent).toHaveLength(0);
  });
});
