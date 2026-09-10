import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildDecision,
  buildMembers,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { HMW_TEMPLATES } from "@/features/hmw";
import type { Note } from "@/features/notes";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import { RoomBoardView, type RoomBoardViewProps } from "./room-board-view";

const ME = "11111111-1111-4111-8111-111111111111";

function buildInteractions(
  notes: Note[],
  privateNotes: Note[],
): RoomBoardInteractions {
  return {
    boardRootRef: { current: null },
    boardScrollerRef: { current: null },
    ideaMapPlaneRef: { current: null },
    privateToolbarRef: { current: null },
    notes,
    privateNotes,
    dragGhost: null,
    isReturnDropTarget: false,
    isNoteDragging: false,
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: {
      backgroundImage:
        "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--foreground) 30%, transparent) 1px, transparent 1.5px)",
      backgroundPosition: "0 0",
      backgroundSize: "20px 20px",
    },
    isPanning: false,
    onCanvasPointerDown: vi.fn(),
    onCanvasPointerMove: vi.fn(),
    onCanvasPointerEnd: vi.fn(),
    onPresencePointerMove: vi.fn(),
    onPresencePointerLeave: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onFitToNotes: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerEnd: vi.fn(),
    onNoteDragStart: vi.fn(),
    onPrivateNoteDragStart: vi.fn(),
  };
}

function setup(overrides: Partial<Parameters<typeof RoomBoardView>[0]> = {}) {
  const props = {
    notes: buildNotes(2),
    inviteCode: "AB12CD",
    inviteUrl: "https://idea-flow.example/invite/AB12CD",
    phase: buildPhaseStep(1),
    decision: null,
    timer: { status: "idle" } as const,
    timerServerOffsetMs: 0,
    isHost: false,
    isNextPhasePending: false,
    hmwDecidedIssue: null,
    decidedHmw: null,
    onHmwTemplateSelect: vi.fn(),
    onIdeaHintSelect: vi.fn(),
    draggingNoteId: null,
    members: buildMembers(2, ME),
    currentUserId: ME,
    hostUserId: ME,
    onNextPhase: vi.fn(),
    onTimerStart: vi.fn(),
    onTimerPause: vi.fn(),
    onTimerResume: vi.fn(),
    onTimerExtend: vi.fn(),
    onTimerStop: vi.fn(),
    onAddPrivateNote: vi.fn(),
    onPrivateNoteContentChange: vi.fn(),
    onPrivateNoteDelete: vi.fn(),
    onNoteContentChange: vi.fn(),
    onNoteDelete: vi.fn(),
    onGroupCreate: vi.fn(),
    onGroupUpdateName: vi.fn(),
    onLeave: vi.fn(),
    isLeaving: false,
    onNoteVote: vi.fn(),
    onNoteVoteRemove: vi.fn(),
    onNoteVoteStickerRemove: vi.fn(),
    onNoteVoteStickerMove: vi.fn(),
    pendingVoteOperations: [],
    voteFeedback: null,
    onNoteDecide: vi.fn(),
    connectionStatus: "open" as const,
    groups: [],
    remoteCursors: [],
    remoteNoteDrags: [],
    areCursorsVisible: true,
    onToggleCursors: vi.fn(),
    ...overrides,
  } as RoomBoardViewProps;
  const resolvedProps: RoomBoardViewProps = {
    ...props,
    interactions: props.interactions ?? buildInteractions(props.notes, []),
  };

  const renderResult = render(<RoomBoardView {...resolvedProps} />);

  return { ...renderResult, props: resolvedProps };
}

function openRoomMenu() {
  fireEvent.click(screen.getByRole("button", { name: "ルームメニューを開く" }));
}

function openMembers() {
  fireEvent.click(screen.getByRole("button", { name: /参加者 \d+人/ }));
}

function noteWithSingleVote() {
  return buildNotes(1).map((note) => ({
    ...note,
    dotVotes: {
      subjective: { count: 1, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
  }));
}

// カード内の選択・ドラッグ・キー操作を受けるサーフェス（透明なbutton）。
function getNoteSurface(card: HTMLElement) {
  return within(card).getByRole("button", { name: "付箋" });
}

// pointerdown → pointerup を同じ座標で行う「移動なしのクリック」。
function clickNote(card: HTMLElement) {
  const surface = getNoteSurface(card);
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
}

describe("RoomBoardView", () => {
  describe("ファシリテーションガイド", () => {
    it("既定で展開し、同じステップ中は利用者が折り畳める", () => {
      setup();

      const root = screen.getByTestId("room-board-view-root");
      expect(root).toHaveAttribute("data-guide-expanded", "true");

      fireEvent.click(
        screen.getByRole("button", {
          name: "ファシリテーションガイドを折り畳む",
        }),
      );

      expect(root).toHaveAttribute("data-guide-expanded", "false");
      expect(screen.getByTestId("facilitation-guide-shell")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("ステップが変わると再展開する", () => {
      const { props, rerender } = setup();
      fireEvent.click(
        screen.getByRole("button", {
          name: "ファシリテーションガイドを折り畳む",
        }),
      );

      rerender(<RoomBoardView {...props} phase={buildPhaseStep(2)} />);

      expect(screen.getByTestId("room-board-view-root")).toHaveAttribute(
        "data-guide-expanded",
        "true",
      );
      expect(screen.getByText("6分")).toBeInTheDocument();
    });
  });

  it("Step 3-5 は決定前後とも次へを表示せず、決定後だけ完了を表示する", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      decision: null,
    });

    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("スプリント完了")).not.toBeInTheDocument();

    rerender(
      <RoomBoardView
        {...props}
        phase={buildPhaseStep(5, 3)}
        decision={buildDecision({ phase: 3, noteId: "note-1" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByText("スプリント完了")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).not.toBeInTheDocument();
  });

  it("非ホストにはタイマー状態だけを表示し操作を出さない", () => {
    setup({
      isHost: false,
      timer: { status: "paused", remainingMs: 30_000, durationMs: 60_000 },
      timerServerOffsetMs: 0,
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    expect(screen.queryByRole("button", { name: "再開" })).toBeNull();
  });

  it("ホストのタイマー開始操作を onTimerStart へ渡す", () => {
    const onTimerStart = vi.fn();
    setup({ isHost: true, onTimerStart });
    fireEvent.click(screen.getByTestId("room-timer"));
    fireEvent.change(screen.getByLabelText("タイマー時間（分）"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("タイマー時間（秒）"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(onTimerStart).toHaveBeenCalledWith(90_000);
  });

  it("host の招待URLと招待コードはルームメニューから表示する", () => {
    setup({
      isHost: true,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://idea-flow.example/invite/ZZ99XX",
    });

    expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
    openRoomMenu();

    expect(screen.getByText("招待URL")).toBeInTheDocument();
    expect(screen.getByText("招待コード")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toHaveTextContent("https://idea-flow.example/invite/ZZ99XX");
    expect(
      screen.getByRole("button", { name: "招待コードをコピー" }),
    ).toHaveTextContent("ZZ99XX");
  });

  it("付箋を配置する", () => {
    setup({ notes: buildNotes(3) });

    expect(screen.getAllByTestId("note-card")).toHaveLength(3);
  });

  it("無限キャンバスのドット・世界レイヤー・ズームHUDを描画する", () => {
    setup({ notes: buildNotes(3) });

    const canvas = screen.getByTestId("board-canvas");
    const viewport = canvas.parentElement;
    expect(viewport).toHaveClass("overflow-hidden");
    expect(viewport?.style.backgroundSize).toBeTruthy();
    expect(viewport?.style.backgroundImage).toContain("radial-gradient");
    expect(viewport?.style.backgroundImage).toContain("var(--foreground) 30%");
    expect(viewport?.style.backgroundImage).not.toContain("linear-gradient");
    expect(canvas).toHaveStyle({ transformOrigin: "0 0" });
    expect(canvas.getAttribute("style")).toContain("scale(");
    expect(screen.getByTestId("canvas-zoom-hud")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "付箋全体を表示" }),
    ).toBeInTheDocument();
  });

  it("ツールバーの付箋追加ボタンでonAddPrivateNoteを呼ぶ", () => {
    const onAddPrivateNote = vi.fn();
    setup({ onAddPrivateNote });

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(onAddPrivateNote).toHaveBeenCalledTimes(1);
  });

  it("マイ付箋ドックをボード下端のオーバーレイとして配置する", () => {
    setup();

    expect(screen.getByTestId("board-frame")).toContainElement(
      screen.getByTestId("private-notes-dock"),
    );
    expect(screen.getByTestId("private-notes-dock")).toHaveClass(
      "absolute",
      "bottom-3",
      "justify-end",
    );
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("投票パレットに残り投票可能数を表示する", () => {
    setup({
      phase: buildPhaseStep(4),
      notes: buildNotes(2).map((note, index) => ({
        ...note,
        dotVotes: {
          subjective: {
            count: index === 0 ? 1 : 0,
            votedByMe: index === 0,
            ownCount: index === 0 ? 1 : 0,
          },
          objective: { count: index + 1, votedByMe: true, ownCount: 1 },
        },
      })),
    });

    expect(
      screen.getByRole("button", { name: "主観シール 残り0票" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "客観シール 残り1票" }),
    ).toBeInTheDocument();
    const palette = screen.getByRole("region", { name: "投票パレット" });
    expect(screen.getByTestId("vote-palette-hud")).toHaveClass(
      "absolute",
      "bottom-3",
    );
    expect(screen.getByTestId("vote-palette-hud")).toContainElement(palette);
    expect(screen.getByTestId("board-control-hud")).not.toContainElement(
      palette,
    );
  });

  it("パレットのシールを付箋へドロップすると、付箋内の相対座標で投票を送る", () => {
    const onNoteVote = vi.fn();
    setup({
      phase: buildPhaseStep(4),
      notes: buildNotes(1),
      onNoteVote,
    });
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
    const elementFromPoint = vi.fn(() => note);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
      { pointerId: 9, clientX: 320, clientY: 24 },
    );
    fireEvent.pointerUp(screen.getByTestId("room-board-view-root"), {
      pointerId: 9,
      clientX: 150,
      clientY: 175,
    });

    expect(onNoteVote).toHaveBeenCalledWith("note-1", "objective", 0.25, 0.5);
  });

  it("シールのドラッグがキャンセルされたときは投票しない", () => {
    const onNoteVote = vi.fn();
    setup({
      phase: buildPhaseStep(4),
      notes: buildNotes(1),
      onNoteVote,
    });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
      { pointerId: 9, clientX: 320, clientY: 24 },
    );
    fireEvent.pointerCancel(screen.getByTestId("room-board-view-root"), {
      pointerId: 9,
      clientX: 150,
      clientY: 175,
    });

    expect(onNoteVote).not.toHaveBeenCalled();
  });

  it("投票中は付箋上のシールを別の付箋へドラッグして移動する", () => {
    const onNoteVoteStickerMove = vi.fn();
    const stickerId = "33333333-3333-4333-8333-333333333333";
    const notes = [
      buildNotes(1)[0],
      {
        ...buildNotes(1)[0],
        id: "note-2",
        content: "移動先",
        x: 400,
      },
    ].map((note, index) =>
      index === 0
        ? {
            ...note,
            dotVotes: {
              subjective: { count: 0, votedByMe: false, ownCount: 0 },
              objective: { count: 1, votedByMe: true, ownCount: 1 },
            },
            dotVoteStickers: [
              { id: stickerId, kind: "objective" as const, x: 0.2, y: 0.3 },
            ],
          }
        : note,
    );
    setup({
      phase: buildPhaseStep(4),
      notes,
      onNoteVoteStickerMove,
    });

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

    expect(onNoteVoteStickerMove).toHaveBeenCalledWith(
      stickerId,
      "note-2",
      0.25,
      0.5,
    );
  });

  it("現在地と操作HUDをキャンバス上に重ねる", () => {
    setup({ isHost: true });

    expect(screen.getByTestId("board-context-hud")).toHaveClass("absolute");
    expect(screen.getByTestId("board-progress-rail")).toBeInTheDocument();
    expect(screen.getByTestId("board-control-hud")).toHaveClass(
      "absolute",
      "top-0",
    );
    expect(screen.getByTestId("room-board-view-root")).toHaveClass("relative");
  });

  it("Step 1-4 のホストは Step 1-5 へ進める", () => {
    setup({ isHost: true, phase: buildPhaseStep(4) });

    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).not.toBeDisabled();
  });

  it("Step 1-5 では投票結果をダイアログ表示し、閉じると元のボードで話し合える", () => {
    setup({
      phase: buildPhaseStep(5),
      members: buildMembers(2, ME),
      notes: buildNotes(4).map((note, index) => ({
        ...note,
        content: ["課題A", "課題B", "課題C", "課題D"][index],
        dotVotes: {
          subjective: {
            count: [2, 0, 0, 0][index],
            votedByMe: false,
            ownCount: 0,
          },
          objective: {
            count: [1, 5, 1, 0][index],
            votedByMe: false,
            ownCount: 0,
          },
        },
      })),
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("vote-result-ranking")).toBeInTheDocument();
    expect(screen.getByTestId("board-canvas")).toBeInTheDocument();
    expect(screen.getByText("総合ポイントが高い順")).toBeInTheDocument();
    expect(screen.getByText("1位")).toBeInTheDocument();
    expect(screen.getByText("2位")).toBeInTheDocument();
    expect(screen.getByText("3位")).toBeInTheDocument();
    expect(screen.queryByText("TOP 3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("board-canvas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "投票結果を表示" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("結果ダイアログのランキング行からホストの決定操作を通知する", () => {
    const onNoteDecide = vi.fn();
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      onNoteDecide,
      notes: noteWithSingleVote(),
    });

    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "付箋 1を取り組む課題に決定",
      })[0],
    );

    expect(onNoteDecide).toHaveBeenCalledWith("note-1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("結果ダイアログは決定済み付箋をstatusとして表示する", () => {
    setup({
      phase: buildPhaseStep(5),
      decision: buildDecision({ noteId: "note-1", decidedBy: ME }),
      notes: noteWithSingleVote(),
    });

    expect(
      within(screen.getByRole("dialog")).getByRole("status", {
        name: "取り組む課題に決定済み",
      }),
    ).toBeInTheDocument();
  });

  it("切断中は結果ダイアログの決定操作を出さない", () => {
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      connectionStatus: "closed",
      notes: noteWithSingleVote(),
    });

    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "付箋 1を取り組む課題に決定",
      }),
    ).not.toBeInTheDocument();
  });

  it("パレットをクリックしても投票せず、ドロップ操作を待つ", () => {
    const onNoteVote = vi.fn();

    setup({
      phase: buildPhaseStep(4),
      onNoteVote,
    });

    fireEvent.click(screen.getByRole("button", { name: "主観シール 残り1票" }));

    expect(onNoteVote).not.toHaveBeenCalled();
  });

  it("結果ステップのホストが選択した付箋を決定するとonNoteDecideを呼ぶ", () => {
    const onNoteDecide = vi.fn();
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      onNoteDecide,
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    const [first] = screen.getAllByTestId("note-card");
    clickNote(first);
    fireEvent.click(
      screen.getByRole("button", {
        name: "この付箋を取り組む課題に決定",
      }),
    );

    expect(onNoteDecide).toHaveBeenCalledWith("note-1");
  });

  describe("接続状態の表示", () => {
    it("接続確立中は接続中の表示を出す（loading）", () => {
      setup({ connectionStatus: "connecting" });

      expect(screen.getByRole("status")).toHaveTextContent("接続中");
    });

    it("切断中は再接続中の表示を出す（error）", () => {
      setup({ connectionStatus: "closed" });

      expect(screen.getByRole("status")).toHaveTextContent("再接続");
    });

    it("接続済みならインジケータを出さない（success）", () => {
      setup({ connectionStatus: "open" });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("未接続時の操作無効化", () => {
    // WebSocket が connecting / closed の間に編集させると、room-client が
    // 送信を黙って破棄するため「入力したのに再接続後のsnapshotで消える」
    // ことになる。未接続中はボタン・付箋の操作自体を無効化する。
    it.each([
      "connecting",
      "closed",
    ] as const)("%sの間はツールバーの「付箋を追加」ボタンが無効化される", (connectionStatus) => {
      setup({ connectionStatus });

      expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();
    });

    it("openの間はツールバーの「付箋を追加」ボタンが有効", () => {
      setup({ connectionStatus: "open" });

      expect(
        screen.getByRole("button", { name: "付箋を追加" }),
      ).not.toBeDisabled();
    });

    it.each([
      "connecting",
      "closed",
    ] as const)("%sの間は Step 2-1 の HMW テンプレートボタンが無効化される", (connectionStatus) => {
      setup({ phase: buildPhaseStep(1, 2), notes: [], connectionStatus });

      expect(
        screen.getByRole("button", { name: HMW_TEMPLATES[0] }),
      ).toBeDisabled();
    });

    it("openの間は Step 2-1 の HMW テンプレートを選ぶと onHmwTemplateSelect が呼ばれる", () => {
      const onHmwTemplateSelect = vi.fn();
      setup({
        phase: buildPhaseStep(1, 2),
        notes: [],
        connectionStatus: "open",
        onHmwTemplateSelect,
      });

      fireEvent.click(screen.getByRole("button", { name: HMW_TEMPLATES[0] }));

      expect(onHmwTemplateSelect).toHaveBeenCalledWith(HMW_TEMPLATES[0]);
    });

    it("closedの間は付箋をクリックしても選択されない", () => {
      setup({ connectionStatus: "closed" });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);

      expect(first).not.toHaveAttribute("data-selected");
    });
  });

  describe("付箋の選択", () => {
    it("付箋をクリックすると選択され、ボード背景のクリックで解除される", () => {
      setup();

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      expect(first).toHaveAttribute("data-selected", "true");

      fireEvent.pointerDown(screen.getByTestId("board-canvas"), {
        pointerId: 1,
      });
      expect(first).not.toHaveAttribute("data-selected");
    });

    it("別の付箋をクリックすると選択が移る（同時に選択されるのは1枚だけ）", () => {
      setup();

      const [first, second] = screen.getAllByTestId("note-card");
      clickNote(first);
      clickNote(second);

      expect(first).not.toHaveAttribute("data-selected");
      expect(second).toHaveAttribute("data-selected", "true");
    });

    it("選択済みの付箋をもう一度クリックすると編集モードに入る", () => {
      setup();

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      clickNote(first);

      expect(within(first).getByRole("textbox")).toHaveFocus();
    });

    it("選択中の付箋でBackspaceを押すとonNoteDeleteを呼ぶ", () => {
      const onNoteDelete = vi.fn();
      setup({ onNoteDelete });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      fireEvent.keyDown(getNoteSurface(first), { key: "Backspace" });

      expect(onNoteDelete).toHaveBeenCalledWith("note-1");
    });
  });

  describe("付箋のグループ化表示", () => {
    it("近くに置かれた複数の付箋がある場合、グループ枠が描画されること", () => {
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 350, y: 100 }); // 隙間 50px (閾値 60px 以下)
      setup({
        notes: [note1, note2],
        phase: buildPhaseStep(3),
      });

      expect(screen.getByTestId("note-group-card")).toBeInTheDocument();
      expect(screen.getByText("グループ")).toBeInTheDocument();
    });

    it("離れた位置に置かれた複数の付箋がある場合、グループ枠は描画されないこと", () => {
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 361, y: 100 }); // 隙間 61px (閾値 60px 超)
      setup({
        notes: [note1, note2],
        phase: buildPhaseStep(3),
      });

      expect(screen.queryByTestId("note-group-card")).not.toBeInTheDocument();
    });

    it("グループ内の付箋に名前が紐づいている場合、その名前でグループが表示されること", () => {
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 350, y: 100 });
      setup({
        notes: [note1, note2],
        phase: buildPhaseStep(3),
        groups: [
          {
            id: "g1",
            name: "カスタム課題グループ",
            noteIds: ["note-1", "note-2"],
          },
        ],
      });

      expect(screen.getByText("カスタム課題グループ")).toBeInTheDocument();
    });

    it("無名の仮グループに名前を入力して確定すると onGroupCreate が呼ばれること", () => {
      const onGroupCreate = vi.fn();
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 350, y: 100 });
      setup({
        notes: [note1, note2],
        phase: buildPhaseStep(3),
        onGroupCreate,
      });

      // ラベルをクリックして編集モードにする
      const label = screen.getByText("グループ");
      fireEvent.click(label);

      // input要素が表示されることを確認
      const input = screen.getByTestId("group-name-input");
      expect(input).toBeInTheDocument();

      // 値を入力してEnterキーを押下
      fireEvent.change(input, { target: { value: "新規グループ名" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // onGroupCreate コールバックが呼ばれ、名前と noteIds が渡されること
      expect(onGroupCreate).toHaveBeenCalledWith("新規グループ名", [
        "note-1",
        "note-2",
      ]);
    });

    it("既存グループの名前を編集して確定すると onGroupUpdateName が呼ばれること", () => {
      const onGroupUpdateName = vi.fn();
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 350, y: 100 });
      setup({
        notes: [note1, note2],
        phase: buildPhaseStep(3),
        groups: [
          { id: "g1", name: "元々の名前", noteIds: ["note-1", "note-2"] },
        ],
        onGroupUpdateName,
      });

      const label = screen.getByText("元々の名前");
      fireEvent.click(label);

      const input = screen.getByTestId("group-name-input");
      fireEvent.change(input, { target: { value: "新しい名前" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onGroupUpdateName).toHaveBeenCalledWith("g1", "新しい名前");
    });
  });

  describe("ステップ移行", () => {
    it("ホストの場合のみ「次のステップへ」ボタンを表示する", () => {
      setup({ isHost: true });

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
    });

    it("ステップ移行前に確認ダイアログを表示し、確認後にonNextPhaseを呼ぶ", () => {
      const onNextPhase = vi.fn();
      setup({ isHost: true, onNextPhase });

      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

      expect(
        screen.getByText("次のステップへ進みますか？"),
      ).toBeInTheDocument();

      expect(onNextPhase).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "移行する" }));

      expect(onNextPhase).toHaveBeenCalledTimes(1);
    });

    it("Step 1-5 は投票結果の確認後も、未決定なら「次のステップへ」を無効にする", () => {
      setup({ isHost: true, phase: buildPhaseStep(5), decision: null });

      // 結果ステップで自動表示される投票結果ダイアログを閉じてから検証する。
      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeDisabled();
    });

    it("Step 1-5 で課題が決定されると2-1への「次のステップへ」を表示する", () => {
      setup({
        isHost: true,
        phase: buildPhaseStep(5),
        decision: buildDecision({ noteId: "note-1" }),
      });

      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).not.toBeDisabled();
    });

    it("Step 2-1 では次のステップ(2-2)へ進める", () => {
      setup({ isHost: true, phase: buildPhaseStep(1, 2), notes: [] });

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).not.toBeDisabled();
    });
  });

  describe("ステップごとの付箋編集制御", () => {
    it("Step1では付箋編集できる", () => {
      setup({
        phase: buildPhaseStep(1),
      });

      const [first] = screen.getAllByTestId("note-card");

      clickNote(first);
      clickNote(first);

      expect(within(first).getByRole("textbox")).not.toHaveAttribute(
        "readonly",
      );
    });

    it("Step2では付箋編集できる", () => {
      setup({
        phase: buildPhaseStep(2),
      });

      const [first] = screen.getAllByTestId("note-card");

      clickNote(first);
      clickNote(first);

      expect(within(first).getByRole("textbox")).not.toHaveAttribute(
        "readonly",
      );
    });

    it("Step3以降では付箋編集できない", () => {
      setup({
        phase: buildPhaseStep(3),
      });

      const [first] = screen.getAllByTestId("note-card");

      clickNote(first);

      clickNote(first);
      clickNote(first);

      expect(within(first).getByRole("textbox")).toHaveAttribute("readonly");
    });
    it("Step1-4では付箋追加入口を表示しない", () => {
      setup({
        phase: buildPhaseStep(4),
      });

      expect(
        screen.queryByRole("button", {
          name: "付箋を追加",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("グループ編集制御", () => {
    it("Step1-2では自動グループ表示を行わない", () => {
      const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
      const note2 = buildNote({ id: "note-2", x: 350, y: 100 });

      setup({
        phase: buildPhaseStep(2),
        notes: [note1, note2],
      });

      expect(screen.queryByTestId("note-group-card")).not.toBeInTheDocument();
    });

    it("Step3ではグループ名編集できる", () => {
      setup({
        phase: buildPhaseStep(3),
        groups: [
          {
            id: "g1",
            name: "テスト",
            noteIds: ["note-1", "note-2"],
          },
        ],
      });

      fireEvent.click(screen.getByText("テスト"));

      expect(screen.getByTestId("group-name-input")).toBeInTheDocument();
    });

    it("Step4ではグループ名編集できない", () => {
      setup({
        phase: buildPhaseStep(4),
        groups: [
          {
            id: "g1",
            name: "テスト",
            noteIds: ["note-1", "note-2"],
          },
        ],
      });

      fireEvent.click(screen.getByText("テスト"));

      expect(screen.queryByTestId("group-name-input")).not.toBeInTheDocument();
    });
  });

  describe("投票UI表示制御", () => {
    it("Step1-1では投票UIを表示しない", () => {
      setup({
        phase: buildPhaseStep(1),
      });

      expect(
        screen.queryByRole("region", { name: "投票パレット" }),
      ).not.toBeInTheDocument();
    });
    it("Step3では投票UIを表示しない", () => {
      setup({
        phase: buildPhaseStep(3),
      });

      expect(
        screen.queryByRole("region", { name: "投票パレット" }),
      ).not.toBeInTheDocument();
    });

    it("Step4では投票UIを表示する", () => {
      setup({
        phase: buildPhaseStep(4),
      });

      expect(
        screen.getByRole("region", { name: "投票パレット" }),
      ).toBeInTheDocument();
    });

    it("Step1-5ではパレットを閉じ、集計済みシールを表示する", () => {
      setup({
        phase: buildPhaseStep(5),
      });

      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

      expect(
        screen.queryByRole("region", { name: "投票パレット" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("img", { name: "主観シール 0票" }),
      ).toHaveLength(2);
    });
  });

  describe("アイデアサポート表示制御", () => {
    it("フェーズ1ではアイデアサポートを表示しない", () => {
      setup({
        phase: buildPhaseStep(1),
      });

      expect(
        screen.queryByTestId("idea-support-sidebar"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("退出・解散ボタン", () => {
  it("ホストは「ルームを解散」ボタンが描画される", () => {
    setup({ isHost: true });
    openRoomMenu();
    expect(
      screen.getByRole("button", { name: "ルームを解散" }),
    ).toBeInTheDocument();
  });

  it("非ホストは「退出する」ボタンが描画される", () => {
    setup({ isHost: false });
    openRoomMenu();
    expect(
      screen.getByRole("button", { name: "退出する" }),
    ).toBeInTheDocument();
  });

  it("ホストの「ルームを解散」で確認 Dialog が開き、確定で onLeave が呼ばれる", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    setup({ onLeave, isHost: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "ルームメニューを開く" }),
    );
    await user.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("ルームを解散しますか？")).toBeInTheDocument();
    await user.click(screen.getByTestId("leave-confirm-action"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」で Dialog が閉じて onLeave は呼ばれない", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    setup({ onLeave, isHost: true });
    await user.click(
      screen.getByRole("button", { name: "ルームメニューを開く" }),
    );
    await user.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("isLeaving=true のときホストボタンは disabled で文言が「解散中…」になる", () => {
    setup({ isLeaving: true, isHost: true });
    openRoomMenu();
    const button = screen.getByRole("button", { name: /解散/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("解散中…");
  });
});

describe("招待URL/コード（host 限定表示）", () => {
  it("非 host のとき招待URL/コードが出ない", () => {
    setup({
      isHost: false,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://example/invite/ZZ99XX",
    });
    expect(screen.queryByText("ZZ99XX")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "招待URLをコピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "招待コードをコピー" }),
    ).not.toBeInTheDocument();
  });
});

describe("参加者 HUD", () => {
  it("メンバー名は参加者ポップオーバーに表示する", () => {
    setup();
    expect(screen.queryByText("Yuki Tanaka")).not.toBeInTheDocument();
    openMembers();
    expect(screen.getByText("Yuki Tanaka")).toBeInTheDocument();
    expect(screen.getByText("Taro Yamada")).toBeInTheDocument();
  });

  it("自分メンバーは data-self と ring で識別する", () => {
    setup();
    openMembers();
    const meRow = screen.getByTestId(`member-row-${ME}`);
    expect(meRow).toHaveAttribute("data-self", "true");
    expect(meRow.textContent).toContain("Yuki Tanaka");
    expect(meRow.textContent).toContain("あなた");
  });

  it("ホストの名前に「ホスト」ラベルが出る", () => {
    setup({ hostUserId: ME });
    openMembers();
    expect(screen.getByTestId(`member-host-label-${ME}`)).toHaveTextContent(
      "ホスト",
    );
  });

  it("10人を超えても HUD は最大10アバターと合計人数で折り返さない", () => {
    setup({ members: buildMembers(13) });
    expect(
      screen.getByRole("button", { name: "参加者 13人" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("avatar")).toHaveLength(10);
  });

  it("1024px向けに7人目以降のアバターを縮約表示する", () => {
    setup({ members: buildMembers(10) });
    const seventhAvatarWrapper =
      screen.getAllByTestId("avatar")[6]?.parentElement;

    expect(seventhAvatarWrapper).toHaveClass("hidden", "xl:inline-flex");
    expect(seventhAvatarWrapper?.classList.contains("inline-flex")).toBe(false);
  });
});
