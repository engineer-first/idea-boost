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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  dismissCandidateNotice: vi.fn(),
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
    dismissCandidateNotice: notifyMocks.dismissCandidateNotice,
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
  PhaseProgress,
  ProtocolNote,
  SharingState,
  TimerState,
} from "@/contracts/room-protocol";
import {
  buildCarryover,
  buildGroup,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { DECIDED_ISSUE_LABEL } from "@/features/hmw";
import { RoomBoard } from "./room-board";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STICKER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const THIRD_PRIVATE_NOTE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const NEW_PRIVATE_NOTE_ID = "11111111-2222-4222-8222-111111111111";
const sharingOrder = [
  { userId: USER_ID, name: "ホスト", color: "yellow" as const },
  { userId: OTHER_USER_ID, name: "参加者", color: "green" as const },
];
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

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
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

  simulateAuthRequiredClose(): void {
    this.readyState = 3;
    this.emit("close", { code: 4002, reason: "authentication required" });
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
    contentRevision: 0,
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

    fontSize: overrides?.fontSize ?? 14,
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
    timer?: TimerState;
    isHost?: boolean;
    carryovers?: Carryover[];
    groups?: PersistentGroup[];
    decision?: Decision | null;
    outcomePublished?: boolean;
    adoptionFocusNoteId?: string | null;
    ideaMapSizeLevel?: number;
    ideaMapSizeInitialized?: boolean;
    ideaMapDragging?: boolean;
    moveProtocolVersion?: 1;
    noteCreateProtocolVersion?: 1 | null;
    sharing?: SharingState | null;
    members?: Array<{ userId: string; name: string; color: "yellow" | "blue" }>;
    progress?: PhaseProgress;
  },
) {
  const { view, socket } = renderBoard({ isHost: options?.isHost ?? true });

  act(() =>
    socket.simulateServerMessage({
      type: "snapshot",
      moveProtocolVersion: options?.moveProtocolVersion,
      noteCreateProtocolVersion:
        options?.noteCreateProtocolVersion === null ? undefined : 1,
      phaseRevision: 0,
      notes,
      members: options?.members ?? [],
      phase: options?.phase ?? buildPhaseStep(1),
      sharing:
        options?.sharing !== undefined
          ? options.sharing
          : options?.phase?.kind === "step" && options.phase.step === 2
            ? buildSharingState({
                order: sharingOrder,
                status: "active",
                currentIndex: 0,
                durationMs: 360000,
              })
            : null,
      isHost: options?.isHost ?? true,
      decision: options?.decision ?? null,
      outcomePublished: options?.outcomePublished ?? false,
      adoptionFocusNoteId: options?.adoptionFocusNoteId ?? null,
      carryovers: options?.carryovers ?? [],
      completedVoterIds: [],
      progress: options?.progress,
      groups: options?.groups,
      timer: options?.timer ?? {
        status: "running",
        endsAt: Date.now() + 60_000,
        durationMs: 60_000,
      },
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

describe("問いの投票中の付箋移動", () => {
  it.each([
    true,
    false,
  ])("ホスト権限%jでシールの貼付・付替・取消から付箋移動まで同じポインターで続けられる", (isHost) => {
    const source = protocolNote();
    const target = protocolNote({
      id: TARGET_NOTE_ID,
      content: "付け替え先",
      x: 400,
    });
    const { socket } = connectWithSnapshot([source, target], {
      phase: buildPhaseStep(3, 2),
      isHost,
      moveProtocolVersion: 1,
    });
    const viewport = screen.getByTestId("board-scroller");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, 800);
    const cards = screen.getAllByTestId("note-card");
    cards[0].getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    cards[1].getBoundingClientRect = () => new DOMRect(400, 100, 200, 150);
    const palette = within(screen.getByTestId("vote-palette-hud")).getByRole(
      "region",
      { name: "投票パレット" },
    );
    const selectTool = within(
      screen.getByTestId("canvas-zoom-controls"),
    ).getByRole("button", { name: "選択ツール" });
    let dropTarget: HTMLElement = cards[0];
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => dropTarget,
    });
    function drag(owner: HTMLElement, clientX: number, clientY: number): void {
      fireEvent.pointerDown(owner, {
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX: 120,
        clientY: 120,
      });
      fireEvent.pointerMove(owner, {
        pointerId: 1,
        buttons: 1,
        clientX,
        clientY,
      });
      fireEvent.pointerUp(owner, { pointerId: 1, clientX, clientY });
    }
    function latest(type: string) {
      return socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === type)
        .at(-1);
    }
    drag(
      within(palette).getByRole("button", { name: "客観シール 残り3票" }),
      150,
      175,
    );
    const add = latest("note:vote-sticker:add");
    expect(add).toMatchObject({ noteId: NOTE_ID, kind: "objective" });
    const sticker = {
      id: add.stickerId,
      kind: "objective" as const,
      x: 0.25,
      y: 0.5,
    };
    const votedSource = {
      ...source,
      dotVoteStickers: [sticker],
      dotVotes: {
        ...source.dotVotes,
        objective: { ownCount: 1, votedByMe: true },
      },
    };
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: add.operationId,
        note: votedSource,
      }),
    );
    dropTarget = cards[1];
    drag(
      within(cards[0]).getByRole("button", {
        name: "客観シール 1票を1票取り消す",
      }),
      450,
      175,
    );
    const move = latest("note:vote-sticker:move");
    expect(move).toMatchObject({
      stickerId: sticker.id,
      noteId: TARGET_NOTE_ID,
    });
    const votedTarget = {
      ...target,
      dotVoteStickers: [sticker],
      dotVotes: votedSource.dotVotes,
    };
    act(() => {
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: move.operationId,
        note: source,
      });
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: move.operationId,
        note: votedTarget,
      });
    });
    dropTarget = palette;
    drag(
      within(cards[1]).getByRole("button", {
        name: "客観シール 1票を1票取り消す",
      }),
      320,
      700,
    );
    const remove = latest("note:vote-sticker:remove");
    expect(remove).toMatchObject({ stickerId: sticker.id });
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: remove.operationId,
        note: target,
      }),
    );
    expect(selectTool).toBeEnabled();
    dropTarget = cards[0];
    drag(within(cards[0]).getByRole("button", { name: "付箋" }), 250, 225);
    expect(latest("note:move:start")).toMatchObject({
      targets: [expect.objectContaining({ noteId: NOTE_ID })],
    });
    expect(latest("note:move:commit")).toMatchObject({
      delta: expect.not.objectContaining({ x: 0, y: 0 }),
    });
    expect(selectTool).toBeEnabled();
  });

  it.each([
    true,
    false,
  ])("新しい移動方式でもホスト権限%jでシール選択中だけ送信を止め、解除後に問いを移動できる", (isHost) => {
    const { socket } = connectWithSnapshot(
      [protocolNote({ authorId: OTHER_USER_ID })],
      { phase: buildPhaseStep(3, 2), isHost, moveProtocolVersion: 1 },
    );
    const palette = screen.getByRole("button", { name: "客観シール 残り3票" });
    const surface = screen.getByRole("button", { name: "付箋" });
    const viewport = screen.getByTestId("board-scroller");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    function move(pointerId: number): void {
      fireEvent.pointerDown(surface, {
        pointerId,
        button: 0,
        buttons: 1,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(surface, {
        pointerId,
        buttons: 1,
        clientX: 130,
        clientY: 130,
      });
      fireEvent.pointerUp(viewport, { pointerId, clientX: 250, clientY: 200 });
    }
    fireEvent.click(palette);
    move(81);
    expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
      expect.objectContaining({ type: expect.stringMatching(/^note:move:/) }),
    );
    fireEvent.click(palette);
    move(82);
    expectSent(socket, {
      type: "note:move:start",
      coordinateSpace: "canvas",
      expectedPhaseRevision: 0,
      targets: [expect.objectContaining({ noteId: NOTE_ID })],
    });
    expectSent(socket, {
      type: "note:move:commit",
      delta: expect.not.objectContaining({ x: 0, y: 0 }),
    });
    expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
      expect.objectContaining({ type: expect.stringMatching(/vote/) }),
    );
  });

  it.each([
    true,
    false,
  ])("2-3でホスト権限%jでも共有済みの他者の問いを移動し、再投票でも再開できる", (isHost) => {
    const note = protocolNote({
      authorId: OTHER_USER_ID,
      content: "重なりを解消する問い",
      x: 100,
      y: 100,
      dotVotes: {
        subjective: { ownCount: 0, votedByMe: false },
        objective: { ownCount: 1, votedByMe: true },
      },
      dotVoteStickers: [{ id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 }],
    });
    const { socket } = connectWithSnapshot([note], {
      phase: buildPhaseStep(3, 2),
      isHost,
    });
    const viewport = screen.getByTestId("board-canvas").parentElement;
    if (!viewport) throw new Error("ボードスクローラーがありません");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const root = screen.getByTestId("room-board-view-root");
    const surface = screen.getByRole("button", { name: "付箋" });
    function move(pointerId: number) {
      fireEvent.pointerDown(surface, {
        pointerId,
        button: 0,
        buttons: 1,
        clientX: 110,
        clientY: 110,
      });
      fireEvent.pointerMove(surface, {
        pointerId,
        buttons: 1,
        clientX: 130,
        clientY: 130,
      });
      fireEvent.pointerMove(root, {
        pointerId,
        buttons: 1,
        clientX: 260,
        clientY: 220,
      });
      fireEvent.pointerUp(root, { pointerId, clientX: 260, clientY: 220 });
    }
    move(81);
    const firstMove = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "note:drag:end");
    expect(firstMove).toMatchObject({
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: expect.not.objectContaining({ x: 100, y: 100 }),
    });
    expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
      expect.objectContaining({ type: expect.stringMatching(/vote/) }),
    );
    expect(screen.getByDisplayValue(note.content)).toHaveAttribute("readonly");
    expect(
      document.querySelector(`[data-vote-sticker-id="${STICKER_ID}"]`),
    ).toHaveStyle({ left: "20%", top: "30%" });
    act(() => {
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...note, ...firstMove.position },
      });
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(4, 2),
        phaseRevision: 1,
        decision: null,
      });
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(3, 2),
        phaseRevision: 2,
        decision: null,
      });
    });
    move(82);
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "note:drag:end"),
    ).toHaveLength(2);
  });
});

it.each([
  1, 2, 3,
] as const)("フェーズ%iで共有許可が発表順に追従し、交代中のドラッグは公開しない", (phase) => {
  const sharing = buildSharingState({
    order: sharingOrder,
    status: "active",
    currentIndex: 1,
    results: ["done"],
  });
  const { socket } = connectWithSnapshot(
    [protocolNote({ visibility: "private" })],
    {
      phase: buildPhaseStep(2, phase),
      sharing,
    },
  );
  const toolbar = openPrivateNotesToolbar();
  const root = screen.getByTestId("room-board-view-root");
  const scroller = screen.getByTestId("board-canvas").parentElement;
  if (!scroller) throw new Error("ボードスクローラーがありません");
  Object.defineProperty(scroller, "getBoundingClientRect", {
    value: () => new DOMRect(0, 0, 500, 400),
  });
  if (phase === 3) {
    const mapPositionArea = screen.getByTestId("idea-map-viewport-plane");
    Object.defineProperty(mapPositionArea, "getBoundingClientRect", {
      value: () => new DOMRect(0, 0, 400, 400),
    });
  }
  mockPrivateToolbarLayout(toolbar);
  function dragPrivate() {
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 655,
      clientY: 125,
    });
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 140,
      clientY: 160,
    });
  }
  function receive(next: SharingState) {
    act(() =>
      socket.simulateServerMessage({
        type: "sharing:updated",
        sharing: next,
        timer: {
          status: "running",
          endsAt: Date.now() + 60_000,
          durationMs: 60_000,
        },
        serverNow: Date.now(),
      }),
    );
  }
  const publishes = () =>
    socket.sent.filter(
      (payload) => JSON.parse(payload).type === "note:publish",
    );
  dragPrivate();
  fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });
  expect(publishes()).toHaveLength(0);

  const myTurn = {
    ...sharing,
    currentIndex: 0,
    results: [],
    revision: crypto.randomUUID(),
  };
  receive(myTurn);
  expect(toolbar).toHaveTextContent("あなたの番です");
  dragPrivate();
  expect(screen.getByTestId("private-note-drag-preview")).toBeInTheDocument();
  receive({ ...sharing, revision: crypto.randomUUID() });
  expect(
    screen.queryByTestId("private-note-drag-preview"),
  ).not.toBeInTheDocument();
  fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });
  expect(publishes()).toHaveLength(0);

  receive(myTurn);
  dragPrivate();
  fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });
  expect(publishes()).toHaveLength(1);
});

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
    buttons: 1,
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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

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
  notifyMocks.dismissCandidateNotice.mockReset();
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
        phaseRevision: 0,
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
    const { socket } = connectWithSnapshot([], {
      timer: { status: "idle" },
    });

    fireEvent.click(screen.getByTestId("room-timer"));
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(socket.sent).toContain(
      JSON.stringify({ type: "timer:start", durationMs: 300_000 }),
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

  it("参加者の snapshot idle 枠を表示し、phase:updated 後も表示を維持する", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: false,
      phase: buildPhaseStep(1),
      timer: { status: "idle" },
    });

    const controls = screen.getByRole("group", { name: "ルームの操作" });
    const timer = within(controls).getByTestId("room-timer");
    expect(timer).toBeVisible();
    expect(timer.tagName).toBe("BUTTON");
    expect(timer).toHaveTextContent("05:00");
    expect(within(timer).getByRole("timer")).toBeInTheDocument();

    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(2),
      }),
    );

    expect(
      screen.getByRole("button", { name: /現在地：① 課題整理・課題共有/ }),
    ).toBeInTheDocument();
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

  it("snapshot の付箋がボードに描画される", () => {
    connectWithSnapshot([protocolNote()]);
    expect(screen.getByDisplayValue("最初の付箋")).toBeInTheDocument();
  });

  it("snapshotの2軸マップを描画し、広さ変更をRoomDOへ送る", () => {
    const { socket } = connectWithSnapshot([], {
      phase: buildPhaseStep(3, 3),
      ideaMapSizeLevel: 2,
      ideaMapSizeInitialized: true,
    });

    expect(screen.getByTestId("idea-map-layout")).toBeInTheDocument();
    const map = screen.getByTestId("idea-value-feasibility-map-plane");
    expect(map).toBeInTheDocument();
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

    expect(selectedCard.parentElement).toHaveStyle({ zIndex: "2147483647" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...selected, stackOrder: 3 },
      }),
    );
    expect(selectedCard).toHaveAttribute("data-selected", "true");
    expect(selectedCard.parentElement).toHaveStyle({ zIndex: "3" });

    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: { ...other, stackOrder: 4 },
      }),
    );
    expect(selectedCard.parentElement).toHaveStyle({ zIndex: "3" });
    expect(otherCard.parentElement).toHaveStyle({ zIndex: "4" });
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

  it.each([
    "private",
    "shared",
  ] as const)("%sの共有・戻すボタンを置かず、Enterやクリックで可視性を変えない", (visibility) => {
    const { socket } = connectWithSnapshot([protocolNote({ visibility })], {
      phase: buildPhaseStep(2),
    });
    openPrivateNotesToolbar();
    expect(
      screen.queryByRole("button", { name: "ボードに共有" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "マイ付箋へ戻す" }),
    ).not.toBeInTheDocument();
    const note = screen.getByRole("button", { name: "付箋" });
    fireEvent.click(note);
    fireEvent.keyDown(note, { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(
      socket.sent.some((message) =>
        /"type":"note:(publish|unpublish)"/.test(message),
      ),
    ).toBe(false);
  });

  it("HMWのサンプル付箋はタイマー開始まで自動作成しない", () => {
    const { socket } = connectWithSnapshot([], {
      phase: buildPhaseStep(1, 2),
      timer: { status: "idle" },
    });

    const sentMessages = () =>
      socket.sent.map((payload) => JSON.parse(payload) as { type?: string });

    // 初期スナップショットのタイマーは idle。
    expect(
      sentMessages().some((message) => message.type === "note:create"),
    ).toBe(false);

    act(() => {
      socket.simulateServerMessage({
        type: "timer:updated",
        timer: {
          status: "running",
          endsAt: Date.now() + 60_000,
          durationMs: 60_000,
        },
        serverNow: Date.now(),
      });
    });

    // タイマー開始後は HMW のサンプル作成が実行される。
    expect(
      sentMessages().some((message) => message.type === "note:create"),
    ).toBe(true);
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

    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    fireEvent.click(
      screen.getByRole("button", { name: "採用する付箋: 最初の付箋" }),
    );

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:decide", noteId: NOTE_ID }),
    );
  });

  it("最終案の決定後もボードを保ち、ホストの完了操作と公開通知で成果を表示する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5, 3),
      isHost: true,
      decision: { phase: 3, noteId: NOTE_ID, decidedBy: USER_ID },
      carryovers: [
        buildCarryover({ phase: 1, content: "課題" }),
        buildCarryover({ phase: 2, content: "問い" }),
      ],
    });
    expect(screen.getByTestId("room-board-view-root")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "完了して成果を表示" }));
    expect(socket.sent).toEqual([]);
    const confirmation = screen.getByRole("alertdialog", {
      name: "スプリントを完了しますか？",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "完了する" }),
    );
    expectSent(socket, { type: "outcome:publish" });
    expect(screen.getByTestId("room-board-view-root")).toBeVisible();
    act(() =>
      socket.simulateServerMessage({
        type: "outcome:published",
        published: true,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "チームで決めた成果" }),
    ).toBeVisible();
  });

  it("結果ステップの候補 hover・leave を adoption-focus:update として即時送信する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
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

  it("確定の取消を送信し、サーバーの解除を受けてから選び直せる", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
      decision: { phase: 1, noteId: NOTE_ID, decidedBy: USER_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "確定を取り消す" }));
    expect(socket.sent).toContain(
      JSON.stringify({ type: "decision:clear", noteId: NOTE_ID }),
    );
    expect(
      screen.queryByRole("button", { name: "採用する付箋を選ぶ" }),
    ).not.toBeInTheDocument();
    act(() =>
      socket.simulateServerMessage({
        type: "decision:updated",
        decision: null,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: /採用する付箋:/ }));
    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:decide", noteId: NOTE_ID }),
    );
  });

  it("個別候補操作は即時反映し、成功確認後だけUndoを表示する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });

    fireEvent.contextMenu(
      within(screen.getByTestId("note-card")).getByRole("button", {
        name: "付箋",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "候補から外す" }));
    const message = socket.sent
      .map((item) => JSON.parse(item))
      .find((item) => item.type === "note:exclude");
    expect(message).toMatchObject({ type: "note:exclude", noteId: NOTE_ID });
    expect(screen.getByTestId("note-card")).toHaveAttribute(
      "data-excluded",
      "true",
    );
    expect(screen.getByRole("button", { name: "候補に戻す" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
    ).toBeDisabled();
    expect(notifyMocks.noteExcluded).not.toHaveBeenCalled();
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        operationId: message.operationId,
        note: protocolNote({
          excluded: true,
          exclusionOperationId: message.operationId,
        }),
      }),
    );
    expect(notifyMocks.noteExcluded).toHaveBeenCalledOnce();
    const undo = notifyMocks.noteExcluded.mock.calls[0]?.[0];
    act(() => undo?.());
    expect(socket.sent.map((item) => JSON.parse(item))).toContainEqual(
      expect.objectContaining({
        type: "note:restore",
        noteId: NOTE_ID,
        expectedExclusionOperationId: message.operationId,
      }),
    );
  });

  it("候補操作の拒否では最新位置を保持し、成功通知を出さない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "候補から外す" }));
    const message = socket.sent
      .map((item) => JSON.parse(item))
      .find((item) => item.type === "note:exclude");
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: protocolNote({ x: 300, y: 350 }),
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "採用確定後は変更できません。",
        operationId: message.operationId,
      }),
    );
    expect(screen.getByTestId("note-card")).not.toHaveAttribute(
      "data-excluded",
    );
    expect(screen.getByTestId(`board-note-${NOTE_ID}`)).toHaveStyle({
      left: "300px",
      top: "350px",
    });
    expect(notifyMocks.noteExcluded).not.toHaveBeenCalled();
  });

  it("結果ステップの参加者は候補外を復帰できる", () => {
    connectWithSnapshot([protocolNote({ excluded: true })], {
      phase: buildPhaseStep(5),
      isHost: false,
    });

    expect(screen.getByText("候補外")).toBeVisible();
    expect(screen.getByRole("button", { name: "候補に戻す" })).toBeVisible();
  });

  it("一括候補外の通知を受け取り、サーバー確定の実件数とoperation IDでUndoする", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
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

  it("別の一括操作では元のUndoを失効させず、復帰要求を順に送り0件では通知しない", () => {
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
    act(() => firstUndo());
    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:bulk-restore",
        operationId: firstOperationId,
      }),
    );
    act(() => secondUndo());
    act(() =>
      socket.simulateServerMessage({
        type: "note:bulk-restored",
        operationId: firstOperationId,
        count: 1,
      }),
    );
    expect(socket.sent).toContain(
      JSON.stringify({
        type: "note:bulk-restore",
        operationId: secondOperationId,
      }),
    );
  });

  it("自動整理を全参加者へ案内し、全員にまとめて戻す操作を渡す", () => {
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
      expect.any(Function),
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
      buttons: 1,
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    });
    fireEvent.pointerMove(root, {
      buttons: 1,
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
        .closest("[data-testid='note-card']")?.parentElement,
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
        .closest("[data-testid='note-card']")?.parentElement,
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
        .closest("[data-testid='note-card']")?.parentElement,
    ).toHaveStyle({ zIndex: "10" });

    fireEvent.pointerDown(screen.getByTestId("board-canvas"), { button: 0 });
    expect(
      screen
        .getByDisplayValue("移動する付箋")
        .closest("[data-testid='note-card']")?.parentElement,
    ).toHaveStyle({ zIndex: "10" });
  });

  it("個人付箋をボードへドラッグすると侵入時はpreviewだけ、有効dropの位置で公開する", () => {
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
    Object.defineProperty(toolbar, "getBoundingClientRect", {
      value: () => ({ left: 600, top: 0, right: 900, bottom: 600 }),
    });
    const handle = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 605,
      clientY: 25,
    });
    expect(
      within(toolbar).queryByTestId("private-note-placeholder"),
    ).toBeInTheDocument();
    const root = screen.getByTestId("room-board-view-root");
    expect(root).toHaveClass("cursor-grabbing");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 120,
      clientY: 140,
    });
    expect(within(toolbar).queryByRole("button", { name: "付箋" })).toBeNull();
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 140, clientY: 160 });
    expect(root).not.toHaveClass("cursor-grabbing");

    expect(socket.sent).toContain(
      JSON.stringify({ type: "note:publish", noteId: NOTE_ID, x: 140, y: 160 }),
    );
    expect(
      socket.sent.some(
        (message) => JSON.parse(message).type === "note:drag:end",
      ),
    ).toBe(false);
  });

  it("マイ付箋previewの位置はACKを待たず更新し、pointerup一件で確定する", () => {
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
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 605,
      clientY: 25,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 100,
      clientY: 120,
    });

    expect(
      socket.sent.some(
        (message) => JSON.parse(message).type === "note:publish",
      ),
    ).toBe(false);

    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 180,
      clientY: 200,
    });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 200, clientY: 220 });

    expectSent(socket, {
      type: "note:publish",
      noteId: NOTE_ID,
      x: 200,
      y: 220,
    });
    expect(
      socket.sent.some(
        (message) => JSON.parse(message).type === "note:drag:end",
      ),
    ).toBe(false);
  });

  it("マイ付箋からボードを跨いでマイ付箋へ戻しても公開しない", () => {
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
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 705,
      clientY: 105,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 120,
      clientY: 140,
    });

    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 650, clientY: 120 });

    expect(
      socket.sent.some((message) =>
        ["note:publish", "note:unpublish", "note:drag:end"].includes(
          JSON.parse(message).type,
        ),
      ),
    ).toBe(false);
    expect(
      within(toolbar).getByRole("button", { name: "付箋" }),
    ).toBeInTheDocument();
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
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 705,
      clientY: 105,
    });

    // 2) ボードへ入る → publish
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 120,
      clientY: 140,
    });

    expect(
      socket.sent.some(
        (message) => JSON.parse(message).type === "note:publish",
      ),
    ).toBe(false);

    // 3) ツールバーへ戻す → ドロップ前なのでプレビューだけ
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 650,
      clientY: 120,
    });

    // 4) 再びボードへ入る → 共有状態のままドラッグを再開
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });

    // 5) ボード上でドロップ
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 200, clientY: 200 });

    // 境界を往復しても公開・非公開を余分に切り替えないこと
    const publishMessages = socket.sent.filter((message) =>
      message.includes('"type":"note:publish"'),
    );
    expect(publishMessages).toHaveLength(1);

    // unpublish が1回送信されていること
    const unpublishMessages = socket.sent.filter((message) =>
      message.includes('"type":"note:unpublish"'),
    );
    expect(unpublishMessages).toHaveLength(0);

    expectSent(socket, {
      type: "note:publish",
      noteId: NOTE_ID,
      x: 200,
      y: 200,
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
    fireEvent.pointerMove(handle, {
      buttons: 1,
      pointerId: 1,
      clientX: 605,
      clientY: 25,
    });
    fireEvent.pointerCancel(root, { pointerId: 1, clientX: 600, clientY: 20 });
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 100,
      clientY: 120,
    });

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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 620, clientY: 120 });

    expectSent(socket, {
      type: "note:unpublish",
      noteId: NOTE_ID,
      privateIndex: 0,
    });
    expectSent(socket, {
      type: "note:drag:end",
      noteId: NOTE_ID,
      position: null,
    });
  });

  it("共有付箋をマイ付箋領域へ入れた瞬間に、挿入位置と追従プレビューを表示する", () => {
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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
      buttons: 1,
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });

    expect(
      within(toolbar).getByTestId("private-note-placeholder"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("private-note-drag-preview")).toBeInTheDocument();
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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 750,
      clientY,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 750,
      clientY,
    });

    expectSent(socket, {
      type: "note:unpublish",
      noteId: NOTE_ID,
      privateIndex: expected.indexOf(NOTE_ID),
    });
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ id: NOTE_ID, visibility: "private" }),
      }),
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
      buttons: 1,
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
      buttons: 1,
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
    expect(cursorLeaveIndex).toBeLessThan(unpublishIndex);

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
      buttons: 1,
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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
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
        note: protocolNote({ id: NOTE_ID, visibility: "private" }),
      }),
    );

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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });
    expect(toolbar).toHaveAttribute("data-return-drop-target", "true");
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 620,
      clientY: 120,
    });

    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        note: protocolNote({ visibility: "private" }),
      }),
    );
    // 2) 確定応答後の別ドラッグでボードへ持っていける
    const returnedPrivateNote = within(toolbar)
      .getAllByTestId("note-card")
      .find((card) => card.getAttribute("data-note-id") === NOTE_ID);
    if (!returnedPrivateNote) throw new Error("戻した付箋がありません");
    const privateSurface = within(returnedPrivateNote).getByRole("button", {
      name: "付箋",
    });
    expect(privateSurface).not.toBeDisabled();
    fireEvent.pointerDown(privateSurface, {
      pointerId: 2,
      clientX: 700,
      clientY: 120,
    });
    fireEvent.pointerMove(privateSurface, {
      buttons: 1,
      pointerId: 2,
      clientX: 705,
      clientY: 125,
    });
    expect(screen.getByTestId("private-note-drag-preview")).toBeInTheDocument();
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 2,
      clientX: 150,
      clientY: 150,
    });

    // 3) ドロップして確定する
    fireEvent.pointerUp(root, { pointerId: 2, clientX: 160, clientY: 160 });

    // unpublish が送られたこと
    expectSent(socket, { type: "note:unpublish", noteId: NOTE_ID });

    // 2回目の publish が送られたこと
    expectSent(socket, { type: "note:publish", noteId: NOTE_ID });

    expectSent(socket, {
      type: "note:publish",
      noteId: NOTE_ID,
      x: 160,
      y: 160,
    });
  });

  it("他メンバーの付箋をマイ付箋領域へドラッグしても非公開に戻せない", () => {
    const { socket } = connectWithSnapshot(
      [protocolNote({ authorId: OTHER_USER_ID })],
      { phase: buildPhaseStep(2, 1) },
    );
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
      buttons: 1,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    expect(toolbar).not.toHaveAttribute("data-return-drop-target");
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
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

    expect(screen.getByTestId("board-connection-status")).toHaveTextContent(
      "接続しています",
    );
  });

  it("接続が確立するとインジケータが消える（success）", () => {
    connectWithSnapshot();

    expect(
      screen.queryByTestId("board-connection-status"),
    ).not.toBeInTheDocument();
  });

  it("予期しない切断で再接続中の表示になる（error）", () => {
    const { socket } = connectWithSnapshot([]);

    act(() => socket.simulateUnexpectedClose());

    expect(screen.getByTestId("board-connection-status")).toHaveTextContent(
      "再接続",
    );
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

    expectSent(socket, {
      type: "note:create",
      operationId: expect.any(String),
    });
    // 確定（note:inserted）が届くまでは描画されない。
    expect(screen.queryAllByTestId("note-card")).toHaveLength(0);
  });

  it("キーと＋の連続追加は1要求だけ送り、相関した応答後に新しい本文を入力できる", () => {
    const { socket } = connectWithSnapshot([]);
    const background = screen.getByTestId("board-scroller");
    background.focus();
    fireEvent.keyDown(background, { key: "Enter", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    const creates = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "note:create");
    expect(creates).toHaveLength(1);
    expect(creates[0].operationId).toEqual(expect.any(String));
    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        operationId: creates[0].operationId,
        note: protocolNote({ content: "", visibility: "private" }),
      }),
    );
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeEnabled();
  });

  it("相関応答に未対応の接続では追加を送らない", () => {
    const { socket } = connectWithSnapshot([], {
      noteCreateProtocolVersion: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
      expect.objectContaining({ type: "note:create" }),
    );
    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();
  });

  it("前の本文の保存確認が遅れても次の本文を書けて、古い配信で下書きを失わない", () => {
    const originalNote = protocolNote({ visibility: "private" });
    const { socket } = connectWithSnapshot([originalNote]);
    const surface = screen.getByRole("button", { name: "付箋" });
    surface.focus();
    fireEvent.keyDown(surface, { key: "Enter" });
    fireEvent.keyDown(surface, { key: "Enter" });
    const originalEditor = screen.getByDisplayValue("最初の付箋");
    originalEditor.focus();
    fireEvent.change(originalEditor, {
      target: { value: "保存確認を待つ文章" },
    });
    fireEvent.keyDown(originalEditor, { key: "Enter", ctrlKey: true });
    const create = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "note:create");
    expect(create).toEqual(
      expect.objectContaining({ operationId: expect.any(String) }),
    );
    const save = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "note:update-content");
    expect(save).toEqual(
      expect.objectContaining({
        noteId: NOTE_ID,
        content: "保存確認を待つ文章",
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "note:inserted",
        operationId: create.operationId,
        note: protocolNote({
          id: NEW_PRIVATE_NOTE_ID,
          content: "",
          visibility: "private",
        }),
      }),
    );
    const newEditor = screen.getByDisplayValue("");
    expect(newEditor).toHaveFocus();
    fireEvent.change(newEditor, { target: { value: "次の文章" } });
    act(() =>
      socket.simulateServerMessage({
        type: "note:updated",
        note: originalNote,
      }),
    );
    expect(screen.getByDisplayValue("保存確認を待つ文章")).toBeInTheDocument();
    expect(screen.getByDisplayValue("次の文章")).toHaveFocus();
    expect(screen.queryByText("保存確認待ち")).not.toBeInTheDocument();
  });

  it("相関した作成拒否は理由を通知し、元の文章を保持して＋を再び使える", () => {
    const { socket } = connectWithSnapshot([
      protocolNote({ visibility: "private", content: "残したい文章" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    const create = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "note:create");
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        operationId: create.operationId,
        code: "forbidden",
        message: "この工程では付箋を追加できません。",
      }),
    );
    expect(notifyMocks.error).toHaveBeenCalledWith(
      "この工程では付箋を追加できません。",
    );
    expect(screen.getByDisplayValue("残したい文章")).toBeInTheDocument();
    expect(screen.getAllByTestId("note-card")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeEnabled();
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
      buttons: 1,
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
      buttons: 1,
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
      buttons: 1,
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
      members: [
        { userId: USER_ID, name: "Yuki Tanaka", color: "yellow" },
        { userId: OTHER_USER_ID, name: "Hana Sato", color: "blue" },
      ],
      progress: {
        phaseRevision: 1,
        progressRevision: 2,
        connectedUserIds: [USER_ID, OTHER_USER_ID],
        readyUserIds: [USER_ID],
        notReadyUserIds: [OTHER_USER_ID],
        canAdvance: true,
        allReady: false,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    expect(
      screen.getByText("完了していないメンバーがいます"),
    ).toBeInTheDocument();

    expect(socket.sent).not.toContain(
      JSON.stringify({
        type: "phase:next",
        expectedPhase: buildPhaseStep(1),
        expectedRevision: 0,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "次へ進む" }));

    expect(socket.sent).toContain(
      JSON.stringify({
        type: "phase:next",
        expectedPhase: buildPhaseStep(1),
        expectedRevision: 0,
        confirmedProgressRevision: 2,
      }),
    );
  });
});

it.each([
  false,
  true,
])("未保存の個人付箋の共有は最新本文のACKまで待ち、二重dropでも一度だけ共有する（ACKと同時に発表交代:%s）", (turnChanged) => {
  const { socket } = connectWithSnapshot(
    [protocolNote({ visibility: "private" })],
    { phase: buildPhaseStep(2) },
  );
  const toolbar = openPrivateNotesToolbar();
  const surface = within(toolbar).getByRole("button", { name: "付箋" });
  fireEvent.pointerDown(surface, {
    pointerId: 1,
    clientX: 610,
    clientY: 110,
  });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 610, clientY: 110 });
  fireEvent.keyDown(surface, { key: "Enter" });
  const editor = screen.getByDisplayValue("最初の付箋");
  fireEvent.change(editor, { target: { value: "共有前に保存する最新本文" } });
  fireEvent.blur(editor);
  const request = socket.sent
    .map((raw) => JSON.parse(raw))
    .find((message) => message.type === "note:update-content");
  const scroller = screen.getByTestId("board-canvas").parentElement;
  if (!scroller) throw new Error("scroller missing");
  Object.defineProperty(scroller, "getBoundingClientRect", {
    value: () => new DOMRect(0, 0, 500, 400),
  });
  mockPrivateToolbarLayout(toolbar);
  const root = screen.getByTestId("room-board-view-root");
  function drop() {
    const surface = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      clientX: 650,
      clientY: 120,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      buttons: 1,
      clientX: 655,
      clientY: 125,
    });
    fireEvent.pointerMove(root, {
      pointerId: 2,
      buttons: 1,
      clientX: 140,
      clientY: 160,
    });
    fireEvent.pointerUp(root, { pointerId: 2, clientX: 140, clientY: 160 });
  }
  drop();
  drop();
  const publishes = () =>
    socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "note:publish");
  expect(publishes()).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent(
    "本文の保存を確認してから共有します",
  );
  act(() => {
    if (turnChanged)
      socket.simulateServerMessage({
        type: "sharing:updated",
        sharing: buildSharingState({
          order: sharingOrder,
          status: "active",
          currentIndex: 1,
          results: ["done"],
        }),
        timer: { status: "idle" },
        serverNow: Date.now(),
      });
    socket.simulateServerMessage({
      type: "note:content-saved",
      operationId: request.operationId,
      noteId: NOTE_ID,
      contentRevision: 1,
    });
  });
  expect(publishes()).toHaveLength(turnChanged ? 0 : 1);
  expect(
    screen.queryByText("本文の保存を確認してから共有します…"),
  ).not.toBeInTheDocument();
  if (!turnChanged)
    expect(publishes()[0]).toMatchObject({
      noteId: NOTE_ID,
      x: expect.any(Number),
      y: expect.any(Number),
    });
});

describe("保存待ちを伴わない工程進行", () => {
  it("移行送信中は二重操作を防ぎ、サーバー確定で現在地・次工程の操作領域・次の進行を表示する", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(1),
      members: [{ userId: USER_ID, name: "Yuki Tanaka", color: "yellow" }],
      progress: {
        phaseRevision: 0,
        progressRevision: 1,
        connectedUserIds: [USER_ID],
        readyUserIds: [USER_ID],
        notReadyUserIds: [],
        canAdvance: true,
        allReady: true,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    const transitions = () =>
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "phase:next");
    expect(transitions()).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(transitions()).toHaveLength(1);
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 1,
      }),
    );
    expect(
      screen.getByRole("button", { name: /現在地：① 課題整理・課題共有/ }),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("board-canvas")).getByDisplayValue(
        "最初の付箋",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(transitions()).toHaveLength(2);
    expect(transitions()[1]).toMatchObject({
      expectedPhase: buildPhaseStep(2),
      expectedRevision: 1,
    });
  });

  it.each([
    "phase:save-requested",
    "snapshot",
  ] as const)("旧%sの保存予約で付箋追加・工程進行を停止しない", (delivery) => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(1),
      members: [{ userId: USER_ID, name: "Yuki Tanaka", color: "yellow" }],
      progress: {
        phaseRevision: 0,
        progressRevision: 1,
        connectedUserIds: [USER_ID],
        readyUserIds: [USER_ID],
        notReadyUserIds: [],
        canAdvance: true,
        allReady: true,
      },
    });
    const pending = {
      transitionId: crypto.randomUUID(),
      expectedPhase: buildPhaseStep(1),
      expectedRevision: 0,
      deadlineAt: Date.now() + 2000,
      serverNow: Date.now(),
    };
    act(() =>
      socket.simulateServerMessage(
        delivery === "phase:save-requested"
          ? { type: delivery, ...pending }
          : {
              type: "snapshot",
              phase: buildPhaseStep(1),
              phaseRevision: 0,
              notes: [],
              members: [
                { userId: USER_ID, name: "Yuki Tanaka", color: "yellow" },
              ],
              noteCreateProtocolVersion: 1,
              isHost: true,
              decision: null,
              carryovers: [],
              completedVoterIds: [],
              progress: {
                phaseRevision: 0,
                progressRevision: 1,
                connectedUserIds: [USER_ID],
                readyUserIds: [USER_ID],
                notReadyUserIds: [],
                canAdvance: true,
                allReady: true,
              },
              timer: {
                status: "running",
                endsAt: Date.now() + 60_000,
                durationMs: 60_000,
              },
              serverNow: Date.now(),
              pendingPhaseTransition: pending,
            },
      ),
    );
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    expectSent(socket, { type: "note:create" });
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expectSent(socket, {
      type: "phase:next",
      expectedPhase: buildPhaseStep(1),
      expectedRevision: 0,
    });
  });

  it("工程進行が拒否されたら送信中を解除し、同じ工程から再試行できる", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(1),
      members: [{ userId: USER_ID, name: "Yuki Tanaka", color: "yellow" }],
      progress: {
        phaseRevision: 0,
        progressRevision: 1,
        connectedUserIds: [USER_ID],
        readyUserIds: [USER_ID],
        notReadyUserIds: [],
        canAdvance: true,
        allReady: true,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "工程を進められません",
      }),
    );
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
    expect(notifyMocks.error).toHaveBeenCalledWith("工程を進められません");
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "phase:next"),
    ).toHaveLength(2);
  });
});

describe("Step 2-1（問いの個人執筆）", () => {
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

  it("「付箋を追加」は content なしの note:create を送る（イベントを content に流さない）", () => {
    const { socket } = connectAtHmwStep();

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        type: "note:create",
        operationId: expect.any(String),
      }),
    );
    const manualCreate = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.operationId);
    expect(manualCreate).not.toHaveProperty("content");
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

  it("Step 1-1 では問いのテンプレートパネルを表示しない", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
    expect(screen.getByText("優先順位を決められない")).toBeInTheDocument();
    expect(
      screen.getByText("どうすれば着手しやすくできるか"),
    ).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "決定した問い" }));
    expect(screen.getByText("優先順位を決められない")).not.toBeVisible();
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
  it("Step 3-3は固定マップを表示し、MyNotes非表示でもマップ領域を維持する", () => {
    const { socket } = connectWithSnapshot([protocolNote({ x: 25, y: 75 })], {
      phase: buildPhaseStep(3, 3),
    });
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
    const world = screen.getByTestId("board-canvas");
    expect(screen.queryByTestId("private-notes-dock")).not.toBeInTheDocument();
    expect(screen.getByTestId("idea-map-workspace-rail")).toBeInTheDocument();
    expect(plane).toContainElement(
      screen.getByTestId("idea-map-viewport-plane"),
    );
    expect(world).toHaveStyle({ transform: "none" });
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter(
          (m) => m.type === "note:drag:move" || m.type === "note:drag:end",
        ),
    ).toEqual([]);
  });
  it.each([
    3, 5,
  ])("Step 3-%iでは付箋だけを移動し、カメラを動かさない", (step) => {
    const { socket } = connectWithSnapshot([protocolNote({ x: 25, y: 75 })], {
      phase: buildPhaseStep(step, 3),
    });
    const canvas = screen.getByTestId("board-canvas");
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
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
    const positionArea = screen.getByTestId("idea-map-viewport-plane");
    Object.defineProperty(positionArea, "getBoundingClientRect", {
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
      transform: "scale(1)",
    });
    const note = within(mappedNote).getByTestId("note-card");

    const surface = within(note).getByRole("button", { name: "付箋" });
    surface.getBoundingClientRect = () => new DOMRect(100, 125, 200, 150);
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, {
      buttons: 1,
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 310,
      clientY: 310,
    });
    fireEvent.pointerUp(root, {
      pointerId: 1,
      clientX: 310,
      clientY: 310,
    });

    const end = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((message) => message.type === "note:drag:end");
    // 閾値を越える移動もpointerdownからの実移動量に含め、
    // 400×400pxのマップ全体に対して最終的な110pxの移動を反映する。
    expect(end.noteId).toBe(NOTE_ID);
    expect(end.position.x).toBeCloseTo(25 + (110 / 400) * 100);
    expect(end.position.y).toBeCloseTo(75 - (110 / 400) * 100);
    expect(canvas.style.transform).toBe(cameraBefore);
  });

  it("Step 3-2でマイ付箋を2軸マップ上へ公開する", () => {
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
    const positionArea = screen.getByTestId("idea-map-viewport-plane");
    Object.defineProperty(positionArea, "getBoundingClientRect", {
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
      buttons: 1,
      pointerId: 1,
      clientX: 605,
      clientY: 25,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 1,
      clientX: 300,
      clientY: 300,
    });

    expect(
      socket.sent.some(
        (message) => JSON.parse(message).type === "note:publish",
      ),
    ).toBe(false);
    const preview = screen.getByTestId("private-note-drag-preview");
    const previewScale = Number(
      preview.style.transform.match(/scale\(([^)]+)/)?.[1] ?? 1,
    );
    const previewSize = {
      width: Number.parseFloat(preview.style.width) * previewScale,
      height: Number.parseFloat(preview.style.height) * previewScale,
    };
    const previewPosition = {
      left: Number.parseFloat(preview.style.left),
      top: Number.parseFloat(preview.style.top),
    };
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 300, clientY: 300 });

    const publish = socket.sent
      .map((message) => JSON.parse(message))
      .find((message) => message.type === "note:publish");
    expect(publish.noteId).toBe(NOTE_ID);
    expect(publish.x).toBeCloseTo(
      ((previewPosition.left + previewSize.width / 2 - 100) / 400) * 100,
    );
    expect(publish.y).toBeCloseTo(
      100 - ((previewPosition.top + previewSize.height / 2 - 100) / 400) * 100,
    );
  });

  it.each([
    4,
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
      buttons: 1,
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

describe("候補Undoの結果工程内の寿命", () => {
  it.each([
    [1, 5, 2, 1],
    [2, 4, 3, 1],
    [3, 5, 3, 4],
  ] as const)("%i-%iから%i-%iへ移ると自動除外通知とUndoを破棄する", (phase, step, nextPhase, nextStep) => {
    notifyMocks.automaticallyExcludedCandidates.mockReturnValue(
      "result-only-toast",
    );
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(step, phase),
    });
    const operationId = "33333333-3333-4333-8333-333333333333";
    act(() =>
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "phase-transition",
      }),
    );
    const undo =
      notifyMocks.automaticallyExcludedCandidates.mock.calls.at(-1)?.[1];
    expect(undo).toBeTypeOf("function");
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(nextStep, nextPhase),
        phaseRevision: 1,
        timer: { status: "idle" },
      }),
    );
    expect(notifyMocks.dismissCandidateNotice).toHaveBeenCalledWith(
      "result-only-toast",
    );
    if (typeof undo !== "function") throw new Error("Undoがありません");
    act(() => undo());
    expect(
      socket.sent.map((payload) => JSON.parse(payload).type),
    ).not.toContain("note:bulk-restore");
  });
  it.each([
    true,
    false,
  ])("採用後は旧Undo/ホストが戻せる通知を消しcallbackも送信しない host=%s", (isHost) => {
    notifyMocks.automaticallyExcludedCandidates.mockReturnValue(
      "u13-candidate-toast",
    );
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost,
    });
    const operationId = "33333333-3333-4333-8333-333333333333";
    act(() =>
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "phase-transition",
      }),
    );
    const undo =
      notifyMocks.automaticallyExcludedCandidates.mock.calls.at(-1)?.[1];
    act(() =>
      socket.simulateServerMessage({
        type: "decision:updated",
        decision: { phase: 1, noteId: NOTE_ID, decidedBy: USER_ID },
      }),
    );
    expect(notifyMocks.dismissCandidateNotice).toHaveBeenCalledWith(
      "u13-candidate-toast",
    );
    if (typeof undo === "function") undo();
    expect(socket.sent).not.toContain(
      JSON.stringify({ type: "note:bulk-restore", operationId }),
    );
  });
  it("結果工程を離れたら旧Undo送信を止めるが、結果工程内では有効", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(5),
      isHost: true,
    });
    const operationId = "33333333-3333-4333-8333-333333333333";
    act(() =>
      socket.simulateServerMessage({
        type: "note:bulk-excluded",
        operationId,
        count: 1,
        source: "manual",
      }),
    );
    const undo = notifyMocks.bulkCandidatesExcluded.mock.calls.at(-1)?.[1];
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(4),
        phaseRevision: 1,
        timer: {
          status: "running",
          endsAt: Date.now() + 60_000,
          durationMs: 60_000,
        },
      }),
    );
    if (typeof undo !== "function") throw new Error("Undoがありません");
    undo();
    expect(socket.sent).not.toContain(
      JSON.stringify({ type: "note:bulk-restore", operationId }),
    );
  });
});

describe("作業中のホスト交代", () => {
  it.each([
    true,
    false,
  ])("1-1でホスト交代後の通知でもマイ付箋を表示し続ける（旧ホスト=%s）", (isHost) => {
    const note = protocolNote({
      visibility: "private",
      content: "交代しても残る下書き",
    });
    const { socket } = connectWithSnapshot([note], { isHost });
    const toolbar = openPrivateNotesToolbar();
    expect(within(toolbar).getByDisplayValue(note.content)).toBeInTheDocument();
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: isHost ? OTHER_USER_ID : USER_ID,
        hostRevision: 1,
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "timer:updated",
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    expect(within(toolbar).getByDisplayValue(note.content)).toBeInTheDocument();
  });

  function connectTransferBoard(hostUserId = USER_ID) {
    const result = connectWithSnapshot();
    act(() =>
      result.socket.simulateServerMessage({
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [
          { userId: USER_ID, name: "Yuki Tanaka", color: "yellow" },
          { userId: OTHER_USER_ID, name: "Hana Sato", color: "blue" },
        ],
        phase: buildPhaseStep(1),
        isHost: hostUserId === USER_ID,
        hostUserId,
        hostRevision: 0,
        decision: null,
        outcomePublished: false,
        carryovers: [],
        completedVoterIds: [],
        progress: {
          phaseRevision: 1,
          progressRevision: 2,
          connectedUserIds: [USER_ID, OTHER_USER_ID],
          readyUserIds: [USER_ID],
          notReadyUserIds: [OTHER_USER_ID],
          canAdvance: true,
          allReady: false,
        },
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    return result;
  }
  it("新ホストは再読込せず現在世代で進行できる", () => {
    const { socket } = connectTransferBoard(OTHER_USER_ID);
    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).toBeInTheDocument();
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: USER_ID,
        hostRevision: 1,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ進む" }));
    expectSent(socket, {
      type: "phase:next",
      confirmedProgressRevision: 2,
    });
  });
  it("古い解散確認は往復移譲後に残らない", () => {
    const { socket } = connectTransferBoard();
    fireEvent.click(
      screen.getByRole("button", { name: "ルームメニューを開く" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    act(() => {
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: OTHER_USER_ID,
        hostRevision: 1,
      });
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: USER_ID,
        hostRevision: 2,
      });
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("相手名の確認後に改訂付きで送り、確定すると旧ホストの操作を消す", () => {
    const { socket } = connectTransferBoard();
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
    fireEvent.click(screen.getByRole("button", { name: "Hana Sato" }));
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "host:transfer"),
    ).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Hana Satoさんをホストにする" }),
    );
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "host:transfer"),
    ).toEqual([
      expect.objectContaining({
        targetUserId: OTHER_USER_ID,
        expectedHostRevision: 0,
      }),
    ]);
    expect(screen.getByRole("button", { name: "変更中…" })).toBeDisabled();
    act(() =>
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: OTHER_USER_ID,
        hostRevision: 1,
      }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hana Sato" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).toBeInTheDocument();
  });
  it("同じ描画前の往復移譲で古い確認を破棄し、盤面を維持する", () => {
    const { socket } = connectTransferBoard();
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
    fireEvent.click(screen.getByRole("button", { name: "Hana Sato" }));
    act(() => {
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: OTHER_USER_ID,
        hostRevision: 1,
      });
      socket.simulateServerMessage({
        type: "host:updated",
        hostUserId: USER_ID,
        hostRevision: 2,
      });
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("room-board-view-root")).toBeInTheDocument();
    expect(
      socket.sent
        .map((raw) => JSON.parse(raw))
        .filter((message) => message.type === "host:transfer"),
    ).toHaveLength(0);
  });
});

describe("ボードの参加者退出", () => {
  it("参加者一覧から確認し、拒否後は同じ画面で再試行できる", () => {
    const { socket } = connectWithSnapshot();
    act(() =>
      socket.simulateServerMessage({
        type: "snapshot",
        notes: [],
        members: [
          { userId: USER_ID, name: "Yuki Tanaka", color: "yellow" },
          { userId: OTHER_USER_ID, name: "Other", color: "blue" },
        ],
        phase: buildPhaseStep(1),
        phaseRevision: 0,
        isHost: true,
        hostUserId: USER_ID,
        hostRevision: 0,
        decision: null,
        outcomePublished: false,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: Date.now(),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /参加者/ }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: "ルームから外す…" }));
    fireEvent.click(screen.getByRole("button", { name: "ルームから外す" }));
    const operation = JSON.parse(socket.sent.at(-1) ?? "");
    expect(operation).toMatchObject({
      type: "member:remove",
      targetUserId: OTHER_USER_ID,
      expectedHostRevision: 0,
    });
    act(() =>
      socket.simulateServerMessage({
        type: "error",
        code: "forbidden",
        message: "現在の参加者を選び直してください",
        operationId: operation.operationId,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("現在の参加者");
    fireEvent.click(screen.getByRole("button", { name: "ルームから外す" }));
    const retry = JSON.parse(socket.sent.at(-1) ?? "");
    expect(retry.operationId).not.toBe(operation.operationId);
    act(() =>
      socket.simulateServerMessage({
        type: "member_left",
        userId: OTHER_USER_ID,
      }),
    );
    act(() =>
      socket.simulateServerMessage({
        type: "member:removed",
        targetUserId: OTHER_USER_ID,
        operationId: retry.operationId,
      }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("transaction interruption DOM", () => {
  it.each([
    "Escape",
    "blur",
    "lostpointercapture",
  ])("%sでpreviewを取消し復帰pointerupでcommitしない", (reason) => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
      moveProtocolVersion: 1,
    });
    const scroller = screen.getByTestId("board-scroller");
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
      buttons: 1,
      pointerId: 7,
      clientX: 110,
      clientY: 110,
    });
    expectSent(socket, { type: "note:move:start" });
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else if (reason === "blur") fireEvent.blur(window);
    else fireEvent.lostPointerCapture(scroller, { pointerId: 7 });
    fireEvent.pointerUp(scroller, {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    });
    expectSent(socket, { type: "note:move:cancel" });
    expect(
      socket.sent
        .map((v) => JSON.parse(v))
        .filter((m) => m.type === "note:move:commit"),
    ).toHaveLength(0);
  });
  it("NoteCardからscrollerへのcapture移管ではpreviewを取消さない", () => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
      moveProtocolVersion: 1,
    });
    const scroller = screen.getByTestId("board-scroller");
    let capturedPointerId: number | null = null;
    scroller.setPointerCapture = vi.fn((pointerId: number) => {
      capturedPointerId = pointerId;
    });
    scroller.hasPointerCapture = vi.fn(
      (pointerId: number) => capturedPointerId === pointerId,
    );
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
      buttons: 1,
      pointerId: 7,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.lostPointerCapture(surface, { pointerId: 7 });
    fireEvent.pointerUp(scroller, { pointerId: 7, clientX: 150, clientY: 150 });
    expectSent(socket, { type: "note:move:commit" });
    expect(
      socket.sent
        .map((v) => JSON.parse(v))
        .filter((m) => m.type === "note:move:cancel"),
    ).toHaveLength(0);
  });
});

describe("pointer origin interruption DOM", () => {
  it.each([
    "Escape",
    "blur",
  ])("閾値前の%sでgestureを破棄し復帰move/upで開始しない", (reason) => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
      moveProtocolVersion: 1,
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
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else fireEvent.blur(window);
    fireEvent.pointerMove(surface, {
      buttons: 1,
      pointerId: 7,
      clientX: 130,
      clientY: 130,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    });
    expect(
      socket.sent
        .map((v) => JSON.parse(v))
        .filter((m) => m.type.startsWith("note:move:")),
    ).toHaveLength(0);
  });
});

describe("pending interruption DOM", () => {
  it.each([
    "Escape",
    "blur",
  ])("送信後の%sでは取消成功扱いせず照会だけ送る", (reason) => {
    const { socket } = connectWithSnapshot([protocolNote()], {
      phase: buildPhaseStep(2, 1),
      moveProtocolVersion: 1,
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
      buttons: 1,
      pointerId: 7,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerUp(screen.getByTestId("board-scroller"), {
      pointerId: 7,
      clientX: 150,
      clientY: 150,
    });
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else fireEvent.blur(window);
    const messages = socket.sent.map((v) => JSON.parse(v));
    expect(messages.filter((m) => m.type === "note:move:commit")).toHaveLength(
      1,
    );
    expect(messages.filter((m) => m.type === "note:move:cancel")).toHaveLength(
      0,
    );
    expect(messages.filter((m) => m.type === "note:move:status")).toHaveLength(
      1,
    );
  });
});

it.each([
  401, 404,
])("再接続の終端%sで入力中の本文を消さず回収欄へ渡す", async (status) => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status })),
  );
  const { socket, view } = connectWithSnapshot([protocolNote()], {
    phase: buildPhaseStep(2),
  });
  fireEvent.change(screen.getByDisplayValue("最初の付箋"), {
    target: { value: "保存前に切れた文章" },
  });
  await act(async () => socket.simulateUnexpectedClose());
  expect(
    screen.getByRole("link", {
      name: status === 401 ? "ログインする" : "ホームへ戻る",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "確認・コピー" }));
  expect(screen.getByRole("textbox", { name: "未反映の文章 1" })).toHaveValue(
    "保存前に切れた文章",
  );
  expect(socket.sent.map((s) => JSON.parse(s))).not.toContainEqual(
    expect.objectContaining({ type: "note:update-content" }),
  );
  view.unmount();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it.each([
  "blur",
  "compositionEnd",
  "change",
] as const)("認証期限の専用close後の%sで回収文を失わず確認・コピーできる", async (lateEvent) => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  vi.stubGlobal("fetch", vi.fn());
  const { socket, view } = connectWithSnapshot([protocolNote()], {
    phase: buildPhaseStep(2),
  });
  fireEvent.change(screen.getByDisplayValue("最初の付箋"), {
    target: { value: "期限切れでも残す入力文" },
  });
  await act(async () => socket.simulateAuthRequiredClose());
  expect(screen.getByRole("link", { name: "ログインする" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(`/rooms/${ROOM_ID}`)}`,
  );
  expect(navigationMocks.replace).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "次の人へ" })).toBeDisabled();
  // 回収UIへフォーカスを移すと、盤面に残ったtextareaの遅延blurが届く。
  const staleEditor = screen.getByDisplayValue("最初の付箋");
  if (lateEvent === "blur") fireEvent.blur(staleEditor);
  else if (lateEvent === "compositionEnd")
    fireEvent.compositionEnd(staleEditor);
  else fireEvent.change(staleEditor, { target: { value: "遅延した古い本文" } });
  fireEvent.click(screen.getByRole("button", { name: "確認・コピー" }));
  expect(screen.getByRole("textbox", { name: "未反映の文章 1" })).toHaveValue(
    "期限切れでも残す入力文",
  );
  fireEvent.click(screen.getByRole("button", { name: "コピー" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith("期限切れでも残す入力文"),
  );
  expect(socket.sent.map((s) => JSON.parse(s))).not.toContainEqual(
    expect.objectContaining({ type: "note:update-content" }),
  );
  expect(
    sessionStorage.getItem(`idea-boost:note-drafts:v1:${USER_ID}:${ROOM_ID}`),
  ).toContain("期限切れでも残す入力文");
  view.unmount();
  vi.unstubAllGlobals();
});

describe("直前のステップへの復元", () => {
  it("2段階の確認後だけ現在の世代を付けて送信し、送信中は重複操作を止める", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(1, 2),
    });
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(1, 2),
        phaseRevision: 7,
        rollbackTarget: buildPhaseStep(5, 1),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ルームメニューを開く" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "直前のステップに戻る" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    expect(
      socket.sent
        .map((s) => JSON.parse(s))
        .some((m) => m.type === "phase:rollback"),
    ).toBe(false);
    fireEvent.pointerDown(screen.getByRole("button", { name: "1-5へ戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    expectSent(socket, {
      type: "phase:rollback",
      expectedPhase: buildPhaseStep(1, 2),
      expectedRevision: 7,
    });
    expect(
      screen.queryByRole("button", { name: "直前のステップに戻る" }),
    ).not.toBeInTheDocument();
  });
  it("世代の変化で古い最終確認を閉じる", () => {
    const { socket } = connectWithSnapshot([], {
      isHost: true,
      phase: buildPhaseStep(1, 2),
    });
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(1, 2),
        phaseRevision: 7,
        rollbackTarget: buildPhaseStep(5, 1),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ルームメニューを開く" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "直前のステップに戻る" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    act(() =>
      socket.simulateServerMessage({
        type: "phase:updated",
        phase: buildPhaseStep(1, 2),
        phaseRevision: 8,
        rollbackTarget: buildPhaseStep(5, 1),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "1-5へ戻る" }),
    ).not.toBeInTheDocument();
    expect(
      socket.sent
        .map((s) => JSON.parse(s))
        .some((m) => m.type === "phase:rollback"),
    ).toBe(false);
  });
});

it("他のホストが戻した後、参加者の古いIME確定・blurで復元済み本文を上書きしない", async () => {
  sessionStorage.clear();
  const { socket } = connectWithSnapshot(
    [protocolNote({ visibility: "private", content: "復元前の本文" })],
    { isHost: false, phase: buildPhaseStep(2) },
  );
  openPrivateNotesToolbar();
  const surface = screen.getByRole("button", { name: "付箋" });
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.keyDown(surface, { key: "Enter" });
  const staleEditor = screen.getByDisplayValue("復元前の本文");
  fireEvent.compositionStart(staleEditor);
  fireEvent.change(staleEditor, { target: { value: "取り消された変換途中" } });
  act(() =>
    socket.simulateServerMessage({
      type: "snapshot",
      notes: [protocolNote({ visibility: "private", content: "復元した本文" })],
      members: [],
      phase: buildPhaseStep(1),
      phaseRevision: 4,
      rollbackRevision: 4,
      isHost: false,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: Date.now(),
    }),
  );
  expect(screen.getByDisplayValue("復元した本文")).toBeVisible();
  // ネイティブIMEが破棄前の入力要素へ遅れて確定値を届けても送信しない。
  fireEvent.compositionEnd(staleEditor, {
    target: { value: "取り消された確定本文" },
  });
  fireEvent.blur(staleEditor);
  await act(async () => {});
  expect(socket.sent.map((s) => JSON.parse(s))).not.toContainEqual(
    expect.objectContaining({
      type: "note:update-content",
      content: "取り消された確定本文",
    }),
  );
  expect(screen.getByDisplayValue("復元した本文")).toBeVisible();
  expect(
    sessionStorage.getItem(`idea-boost:note-drafts:v1:${USER_ID}:${ROOM_ID}`),
  ).toBeNull();
});

it.each([
  1, 2, 3,
] as const)("同段階%iの個人→共有snapshotと工程更新でも本人のIME入力要素と編集を維持する", async (phase) => {
  const original = protocolNote({
    visibility: "private",
    content: "個人工程の本文",
  });
  const { socket } = connectWithSnapshot([original], {
    isHost: false,
    phase: buildPhaseStep(1, phase),
  });
  const toolbar = openPrivateNotesToolbar();
  const surface = within(toolbar).getByRole("button", { name: "付箋" });
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.keyDown(surface, { key: "Enter" });
  const editor = screen.getByDisplayValue("個人工程の本文");
  expect(editor).not.toHaveAttribute("readonly");
  fireEvent.compositionStart(editor);
  fireEvent.change(editor, { target: { value: "かんじへんかん" } });
  act(() => {
    socket.simulateServerMessage({
      type: "snapshot",
      notes: [original],
      members: [],
      phase: buildPhaseStep(2, phase),
      phaseRevision: 1,
      isHost: false,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: {
        status: "running",
        endsAt: Date.now() + 60_000,
        durationMs: 60_000,
      },
      serverNow: Date.now(),
    });
  });
  expect(editor).not.toHaveAttribute("readonly");
  act(() => {
    socket.simulateServerMessage({
      type: "phase:updated",
      phase: buildPhaseStep(2, phase),
      phaseRevision: 1,
    });
  });
  expect(screen.getByDisplayValue("かんじへんかん")).toBe(editor);
  expect(editor).not.toHaveAttribute("readonly");
  expect(editor).toHaveFocus();
  expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
    expect.objectContaining({ type: "note:update-content" }),
  );
  fireEvent.compositionEnd(editor, { target: { value: "漢字変換" } });
  fireEvent.blur(editor);
  await act(async () => {});
  const saves = socket.sent
    .map((raw) => JSON.parse(raw))
    .filter((message) => message.type === "note:update-content");
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({
    content: "漢字変換",
    expectedPhaseRevision: 1,
  });
  act(() => {
    socket.simulateServerMessage({
      type: "note:updated",
      note: { ...original, content: "漢字変換", contentRevision: 1 },
    });
    socket.simulateServerMessage({
      type: "note:content-saved",
      operationId: saves[0].operationId,
      noteId: NOTE_ID,
      contentRevision: 1,
    });
  });
  expect(screen.getByDisplayValue("漢字変換")).toBeVisible();
  expect(
    sessionStorage.getItem(`idea-boost:note-drafts:v1:${USER_ID}:${ROOM_ID}`),
  ).toBeNull();
});

it.each([
  "別段階",
  "非編集",
  "復元",
  "削除",
  "共有済み",
] as const)("IME入力中でも%sでは個人→共有の編集継続を許可せず古い確定を送らない", async (stop) => {
  const original = protocolNote({
    visibility: "private",
    content: "停止前の本文",
  });
  const { socket } = connectWithSnapshot([original], {
    isHost: false,
    phase: buildPhaseStep(1),
  });
  const surface = within(openPrivateNotesToolbar()).getByRole("button", {
    name: "付箋",
  });
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.keyDown(surface, { key: "Enter" });
  const editor = screen.getByDisplayValue("停止前の本文");
  fireEvent.compositionStart(editor);
  fireEvent.change(editor, { target: { value: "取り消す変換" } });
  const phase =
    stop === "別段階"
      ? buildPhaseStep(2, 2)
      : stop === "非編集"
        ? buildPhaseStep(3)
        : buildPhaseStep(2);
  act(() =>
    socket.simulateServerMessage({
      type: "snapshot",
      notes:
        stop === "削除"
          ? []
          : [
              {
                ...original,
                ...(stop === "共有済み" ? { visibility: "shared" } : {}),
              },
            ],
      members: [],
      phase,
      phaseRevision: 1,
      ...(stop === "復元" ? { rollbackRevision: 1 } : {}),
      isHost: false,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: Date.now(),
    }),
  );
  expect(editor.isConnected && !editor.hasAttribute("readonly")).toBe(false);
  fireEvent.compositionEnd(editor, {
    target: { value: "取り消された確定値" },
  });
  fireEvent.blur(editor);
  await act(async () => {});
  expect(socket.sent.map((raw) => JSON.parse(raw))).not.toContainEqual(
    expect.objectContaining({
      type: "note:update-content",
      content: "取り消された確定値",
    }),
  );
});

it("採用後に移動した付箋を画面のUndoから元に戻せる", () => {
  const note = protocolNote();
  const { socket } = connectWithSnapshot([note], {
    phase: buildPhaseStep(4, 2),
    moveProtocolVersion: 1,
    decision: { phase: 2, noteId: NOTE_ID, decidedBy: USER_ID },
  });
  const surface = within(screen.getByTestId("board-canvas")).getByRole(
    "button",
    { name: "付箋" },
  );
  fireEvent.pointerDown(surface, { pointerId: 7, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(surface, {
    buttons: 1,
    pointerId: 7,
    clientX: 110,
    clientY: 110,
  });
  const start = socket.sent
    .map((raw) => JSON.parse(raw))
    .find((message) => message.type === "note:move:start");
  expect(start).toBeDefined();
  fireEvent.pointerUp(screen.getByTestId("board-scroller"), {
    pointerId: 7,
    clientX: 150,
    clientY: 150,
  });
  const before = {
    noteId: NOTE_ID,
    x: note.x,
    y: note.y,
    positionRevision: 0,
    visibilityRevision: 0,
  };
  const after = { ...before, x: note.x + 50, positionRevision: 1 };
  act(() =>
    socket.simulateServerMessage({
      type: "note:move:result",
      operationId: start.operationId,
      status: "accepted",
      receipt: {
        operationId: start.operationId,
        phaseRevision: 0,
        coordinateSpace: "canvas",
        before: [before],
        after: [after],
        groupsBefore: [],
        groupsAfter: [],
        groupRevisionBefore: 0,
        groupRevisionAfter: 0,
        mapRevision: 0,
        affected: [
          { noteId: NOTE_ID, positionRevision: 1, visibilityRevision: 0 },
        ],
        changed: true,
      },
    }),
  );
  const undo = screen.getByRole("button", {
    name: "移動を元に戻す",
  });
  expect(undo).toBeEnabled();
  fireEvent.click(undo);
  expectSent(socket, {
    type: "note:move:inverse",
    sourceOperationId: start.operationId,
  });
});
