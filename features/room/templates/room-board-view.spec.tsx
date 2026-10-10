import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildDecision,
  buildMembers,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import type { Note } from "@/features/notes";
import { useBoardHelp } from "../logic/use-board-help";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import {
  getBoardFitInsets,
  RoomBoardView,
  type RoomBoardViewProps,
} from "./room-board-view";

beforeEach(() => {
  sessionStorage.clear();
  // jsdomには寸法観測がない。通知との重なりはPlaywright側で検証する。
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

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
    onPointerCancel: vi.fn(),
    cancelCurrentNoteDrag: vi.fn(),
    onNoteDragStart: vi.fn(),
    onPrivateNoteDragStart: vi.fn(),
  };
}

// 既存の画面操作シナリオではコンテナ相当の状態を注入する。
// 外部制御のテストでは明示的な help を優先する。
function TestBoardView(props: RoomBoardViewProps) {
  const help = useBoardHelp(props.phase);
  return (
    <RoomBoardView
      {...props}
      help={props.help ?? help}
      initialGuideState={props.initialGuideState ?? "detail"}
    />
  );
}

function setup(overrides: Partial<Parameters<typeof RoomBoardView>[0]> = {}) {
  const props = {
    notes: buildNotes(2),
    inviteCode: "AB12CD",
    inviteUrl: "https://idea-flow.example/invite/AB12CD",
    phase: buildPhaseStep(2),
    decision: null,
    outcomePublished: false,
    adoptionFocusNoteId: null,
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
    onNoteBringToFront: vi.fn(),
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
    onDecisionClear: vi.fn(),
    onPublishOutcome: vi.fn(),
    onAdoptionFocusChange: vi.fn(),

    connectionStatus: "open" as const,
    groups: [],
    remoteCursors: [],
    ...overrides,
  } as RoomBoardViewProps;
  const resolvedProps: RoomBoardViewProps = {
    ...props,
    interactions: props.interactions ?? buildInteractions(props.notes, []),
  };

  const renderResult = render(<TestBoardView {...resolvedProps} />);

  return { ...renderResult, props: resolvedProps };
}

it("選択ツールからの単一移動は押下座標を移動hookへ渡す", () => {
  const { props } = setup({ phase: buildPhaseStep(2) });
  const surface = getNoteSurface(screen.getAllByTestId("note-card")[0]);
  fireEvent.pointerDown(surface, {
    pointerId: 91,
    button: 0,
    buttons: 1,
    clientX: 50,
    clientY: 60,
  });
  fireEvent.pointerMove(surface, {
    pointerId: 91,
    buttons: 1,
    clientX: 80,
    clientY: 90,
  });
  expect(props.interactions.onNoteDragStart).toHaveBeenCalledExactlyOnceWith(
    props.notes[0].id,
    expect.objectContaining({ clientX: 80, clientY: 90 }),
    { clientX: 50, clientY: 60 },
  );
});

function openRoomMenu() {
  fireEvent.click(screen.getByRole("button", { name: "ルームメニューを開く" }));
}

describe("採用する付箋の選択モード", () => {
  it("hover・focus を共有し、Escape・キャンセル・確定・切断で解除を通知する", () => {
    const onAdoptionFocusChange = vi.fn();
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes: [buildNote({ id: "note-1", content: "候補A" })],
      onAdoptionFocusChange,
    });
    const start = () => {
      fireEvent.click(
        screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
      );
      return screen.getByRole("button", { name: "採用する付箋: 候補A" });
    };

    fireEvent.pointerEnter(start());
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith("note-1");
    fireEvent.keyDown(screen.getByTestId("board-scroller"), { key: "Escape" });
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);

    fireEvent.focus(start());
    fireEvent.click(screen.getByRole("button", { name: "選択をキャンセル" }));
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);

    fireEvent.click(start());
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);

    const target = start();
    fireEvent.pointerEnter(target);
    rerender(<TestBoardView {...props} connectionStatus="closed" />);
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);
  });
  it("画面下の入口から開始し、対象を1件クリックすると確定して終了する", () => {
    const onNoteDecide = vi.fn();
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes: [buildNote({ id: "note-1", content: "候補A" })],
      onNoteDecide,
    });

    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "採用する付箋をクリックしてください",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "採用する付箋: 候補A" }),
    );
    expect(onNoteDecide).toHaveBeenCalledWith("note-1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("Escape・キャンセル・ステップ変更・切断で選択モードを解除する", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
    });
    const start = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
      );
    const expectSelectionModeClosed = () =>
      expect(
        screen.queryByText("採用する付箋をクリックしてください"),
      ).not.toBeInTheDocument();

    start();
    fireEvent.keyDown(screen.getByTestId("board-scroller"), { key: "Escape" });
    expectSelectionModeClosed();

    start();
    fireEvent.click(screen.getByRole("button", { name: "選択をキャンセル" }));
    expectSelectionModeClosed();

    start();
    rerender(<TestBoardView {...props} phase={buildPhaseStep(1, 2)} />);
    expectSelectionModeClosed();

    rerender(<TestBoardView {...props} phase={buildPhaseStep(5)} />);
    start();
    rerender(<TestBoardView {...props} connectionStatus="closed" />);
    expectSelectionModeClosed();
  });

  it("空白クリックでは確定せず、候補外と非ホストを対象にしない", () => {
    const onNoteDecide = vi.fn();
    const { rerender, props } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes: [buildNote({ id: "note-1", content: "候補外", excluded: true })],
      onNoteDecide,
    });
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    expect(onNoteDecide).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /採用する付箋:/ }),
    ).not.toBeInTheDocument();

    rerender(<TestBoardView {...props} isHost={false} />);
    expect(
      screen.queryByRole("button", { name: "採用する付箋を選ぶ" }),
    ).not.toBeInTheDocument();
  });

  it("決定済みの内容を全員に示し、ホストだけが取り消せる", () => {
    const notes = [buildNote({ id: "note-1", content: "決定した課題" })];
    const decision = buildDecision({ noteId: "note-1" });
    const { rerender, props } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes,
      decision,
    });
    expect(screen.getAllByText("決定した課題")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "確定を取り消す" }));
    expect(props.onDecisionClear).toHaveBeenCalledOnce();

    rerender(<TestBoardView {...props} isHost={false} />);
    expect(screen.getAllByText("決定した課題")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "確定を取り消す" }),
    ).not.toBeInTheDocument();
  });
});

describe("考えるヒントの外部制御", () => {
  it.each([
    "connecting",
    "closed",
  ] as const)("%s中の確定取消を無効にする", (connectionStatus) => {
    const { props } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      decision: buildDecision({ noteId: "note-1" }),
      connectionStatus,
    });
    const cancel = screen.getByRole("button", { name: "確定を取り消す" });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    expect(props.onDecisionClear).not.toHaveBeenCalled();
  });
  it("3-5で確定を取り消しても結果ダイアログを再度開かずボードで選び直せる", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      isHost: true,
      decision: buildDecision({ phase: 3, noteId: "note-1" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "確定を取り消す" }));
    rerender(<TestBoardView {...props} decision={null} />);
    expect(
      screen.queryByRole("dialog", { name: "投票結果" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    expect(
      screen.getAllByRole("button", { name: /採用するアイデア:/ }),
    ).toHaveLength(2);
  });
  it("成果公開後は確定を取り消せない", () => {
    setup({
      phase: buildPhaseStep(5, 3),
      isHost: true,
      decision: buildDecision({ phase: 3, noteId: "note-1" }),
      outcomePublished: true,
      hmwDecidedIssue: "課題",
      decidedHmw: "問い",
    });
    expect(
      screen.queryByRole("button", { name: "確定を取り消す" }),
    ).not.toBeInTheDocument();
  });
  it("渡された開閉状態を表示し、操作をコールバックで返す", async () => {
    const help = {
      kind: "idea" as const,
      isOpen: false,
      tab: "expand" as const,
      onOpenChange: vi.fn(),
      onTabChange: vi.fn(),
    };
    const { props, rerender } = setup({ phase: buildPhaseStep(1, 3), help });
    fireEvent.click(screen.getByRole("button", { name: "考えるヒントを開く" }));
    expect(help.onOpenChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("button", { name: "考えるヒントを開く" }),
    ).toBeInTheDocument();
    rerender(<TestBoardView {...props} help={{ ...help, isOpen: true }} />);
    expect(screen.getByRole("tab", { name: "発想を広げる" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "書き出し" }));
    expect(help.onTabChange).toHaveBeenCalledWith("write");
    fireEvent.click(
      screen.getByRole("button", { name: "考えるヒントを閉じる" }),
    );
    expect(help.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("0票候補の一括整理", () => {
  it("結果ステップのホストだけに、未決定かつ主観・客観とも0票の件数を表示する", () => {
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes: [
        buildNote({ id: "note-1" }),
        buildNote({
          id: "note-2",
          dotVotes: {
            subjective: { count: 1, votedByMe: false, ownCount: 0 },
            objective: { count: 0, votedByMe: false, ownCount: 0 },
          },
        }),
        buildNote({ id: "note-3", excluded: true }),
        buildNote({ id: "note-4" }),
      ],
      decision: null,
    });
    openRoomMenu();
    expect(
      screen.getByRole("button", {
        name: "投票なしをまとめて候補から外す（2件）",
      }),
    ).toBeInTheDocument();
  });

  it("非ホストと結果ステップ以外には一括整理を表示しない", () => {
    const { rerender, props } = setup({
      phase: buildPhaseStep(5),
      isHost: false,
    });
    expect(screen.queryByText("候補を整理")).toBeNull();
    rerender(<TestBoardView {...props} isHost phase={buildPhaseStep(4)} />);
    expect(screen.queryByText("候補を整理")).toBeNull();
  });
});

describe("上中央の統合ガイド", () => {
  it("初回の案内はモーダルにせず、作業をそのまま始められる", () => {
    const { props } = setup({
      initialGuideState: "intro",
      phase: buildPhaseStep(1),
      notes: [],
      help: {
        kind: null,
        isOpen: true,
        tab: "write",
        onOpenChange: vi.fn(),
        onTabChange: vi.fn(),
      },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "最初の一歩" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    expect(props.onAddPrivateNote).toHaveBeenCalledOnce();
  });
});

describe("1280×720の補助UI", () => {
  it("左右のパネルを独立して開閉し、同じ付箋とカメラを保つ", () => {
    const privateNotes = [
      buildNote({ visibility: "private", content: "書きかけの案" }),
    ];
    const { props } = setup({
      phase: buildPhaseStep(1, 3),
      interactions: buildInteractions([], privateNotes),
    });
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "考えるヒントを閉じる" }),
    );
    expect(screen.getByText("書きかけの案")).toBeInTheDocument();
    expect(screen.queryByTestId("idea-guide-panel")).not.toBeInTheDocument();
    expect(props.interactions.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(props.interactions.onResetZoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "考えるヒントを開く" }));
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("投票へ進むと執筆用の補助UIを隠し、投票パレットを表示する", () => {
    const { props, rerender } = setup({ phase: buildPhaseStep(1, 3) });
    expect(screen.getByTestId("board-help-panel")).toBeInTheDocument();
    rerender(<TestBoardView {...props} phase={buildPhaseStep(4, 3)} />);
    expect(screen.queryByTestId("board-help-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("private-notes-toolbar"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "投票パレット" }),
    ).toBeInTheDocument();
  });
});

function openMembers() {
  fireEvent.click(screen.getByRole("button", { name: /参加者 \d+人/ }));
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
  it.each([
    1, 2, 3,
  ] as const)("フェーズ%sの個人入力画面で選択した付箋をMacのDeleteキー単体で削除できる", (phaseNumber) => {
    const privateNote = buildNote({
      id: "private-note",
      visibility: "private",
      content: "削除する付箋",
    });
    const { props } = setup({
      phase: buildPhaseStep(1, phaseNumber),
      notes: [],
      interactions: buildInteractions([], [privateNote]),
    });
    const card = screen.getByTestId("note-card");

    clickNote(card);
    const surface = getNoteSurface(card);
    expect(surface).toHaveFocus();
    fireEvent.keyDown(surface, { key: "Backspace" });

    expect(props.onPrivateNoteDelete).toHaveBeenCalledWith(privateNote.id);
    expect(props.onNoteDelete).not.toHaveBeenCalled();
  });

  it("個人執筆中も既存HUDを同じ画面に残し、共有キャンバスだけを隠す", () => {
    setup({
      phase: buildPhaseStep(1),
      isHost: true,
      timer: { status: "paused", remainingMs: 30_000, durationMs: 60_000 },
    });

    expect(screen.getByTestId("board-header-row")).toBeInTheDocument();
    expect(screen.getByTestId("step-guide")).toBeInTheDocument();
    expect(screen.getByTestId("board-control-hud")).toBeInTheDocument();
    expect(screen.getByTestId("room-timer")).toHaveTextContent("00:30");
    expect(screen.getByTestId("phase-loop-hud")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("board-scroller")).not.toBeInTheDocument();
  });

  it("外側が pointer capture 中でもドラッグと通常 presence を同じ座標で更新し、cancel を分離する", () => {
    const interactions = buildInteractions(buildNotes(1), []);
    interactions.isNoteDragging = true;
    setup({ interactions });
    const root = screen.getByTestId("room-board-view-root");

    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 3,
      pointerType: "mouse",
      clientX: 240,
      clientY: 180,
    });
    expect(interactions.onPointerMove).toHaveBeenCalled();
    expect(interactions.onPresencePointerMove).toHaveBeenCalled();

    fireEvent.pointerCancel(root, { pointerId: 3, clientX: 240, clientY: 180 });
    expect(interactions.onPointerCancel).toHaveBeenCalled();
    expect(interactions.onPresencePointerLeave).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 240, clientY: 180 }),
    );
    expect(
      vi.mocked(interactions.onPresencePointerLeave).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(interactions.onPointerCancel).mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(interactions.onPointerEnd).not.toHaveBeenCalled();
  });

  describe("ファシリテーションガイド", () => {
    it("詳細を畳んでも現在の作業名を残し、再び同じ場所で開く", () => {
      setup({ phase: buildPhaseStep(1) });
      expect(screen.getByTestId("step-guide")).toHaveAttribute(
        "data-state",
        "detail",
      );
      fireEvent.click(document.body);
      expect(screen.getByTestId("step-guide")).toHaveAttribute(
        "data-state",
        "compact",
      );
      expect(screen.getByTestId("board-current-step")).toHaveTextContent(
        "自分の課題（個人）",
      );
      fireEvent.click(screen.getByRole("button", { name: "進め方" }));
      expect(
        screen.getByRole("region", { name: "ファシリテーションガイド" }),
      ).toBeVisible();
    });
    it("初めての工程では短い案内に切り替え、戻った工程は畳む", () => {
      const { props, rerender } = setup({ phase: buildPhaseStep(1) });
      rerender(<TestBoardView {...props} phase={buildPhaseStep(2)} />);
      expect(screen.getByRole("status", { name: "最初の一歩" })).toBeVisible();
      rerender(<TestBoardView {...props} />);
      expect(screen.getByTestId("step-guide")).toHaveAttribute(
        "data-state",
        "compact",
      );
    });
  });

  it("Step 3-5 は採用案の選択後もボードに留まり、ホストの完了操作を待つ", async () => {
    const onPublishOutcome = vi.fn();
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      decision: null,
      isHost: true,
      onPublishOutcome,
    });

    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "完了して成果を表示" }),
    ).not.toBeInTheDocument();

    rerender(
      <TestBoardView
        {...props}
        phase={buildPhaseStep(5, 3)}
        decision={buildDecision({ phase: 3, noteId: "note-1" })}
      />,
    );

    expect(screen.getByTestId("room-board-view-root")).toBeVisible();
    expect(screen.queryByText("スプリント完了")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "完了して成果を表示" }),
    );
    expect(onPublishOutcome).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("room-board-view-root")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "次のステップへ" }),
    ).not.toBeInTheDocument();
  });

  it("成果公開後に全員へ成果を表示し、作業へ戻る操作を出さない", async () => {
    const idea = buildNote({
      id: "99999999-9999-4999-8999-999999999999",
      content: "採用する案\n次の行",
    });
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      hmwDecidedIssue: "決定課題",
      decidedHmw: "決定した問い",
      decision: null,
    });
    rerender(
      <TestBoardView
        {...props}
        phase={buildPhaseStep(5, 3)}
        notes={[idea]}
        hmwDecidedIssue="決定課題"
        decidedHmw="決定した問い"
        decision={buildDecision({ phase: 3, noteId: idea.id })}
        outcomePublished
      />,
    );
    expect(
      screen.getByRole("heading", { name: "チームで決めた成果" }),
    ).toBeVisible();
    expect(screen.getByText("決定課題")).toBeVisible();
    expect(screen.getByRole("heading", { name: "決定した問い" })).toBeVisible();
    expect(screen.getByText(/採用する案/)).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: /投票結果/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ボードへ戻る" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全文をコピー" })).toBeVisible();
  });

  it("成果が欠けた状態や切断時は保存を許さず再接続を案内する", () => {
    const idea = buildNote({
      id: "99999999-9999-4999-8999-999999999999",
      content: "案",
    });
    setup({
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      decision: buildDecision({ phase: 3, noteId: idea.id }),
      outcomePublished: true,
      hmwDecidedIssue: null,
      decidedHmw: "問い",
      connectionStatus: "closed",
    });
    expect(screen.getByText(/再接続/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "テキストを保存" }),
    ).not.toBeInTheDocument();
  });

  it("コピー失敗後に切断したら手動コピー欄を隠し、表示中の内容を未確認と示す", async () => {
    const idea = buildNote({
      id: "99999999-9999-4999-8999-999999999999",
      content: "案",
    });
    const props = {
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      decision: buildDecision({ phase: 3, noteId: idea.id }),
      outcomePublished: true,
      hmwDecidedIssue: "課題",
      decidedHmw: "問い",
      connectionStatus: "open" as const,
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { props: initial, rerender } = setup(props);
    await userEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
    expect(
      await screen.findByRole("textbox", { name: "手動でコピーする成果全文" }),
    ).toBeVisible();
    rerender(
      <TestBoardView {...initial} {...props} connectionStatus="closed" />,
    );
    expect(
      screen.queryByRole("textbox", { name: "手動でコピーする成果全文" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/前回受信した内容は最新か確認できません/),
    ).toBeVisible();
    expect(screen.getAllByText("未確認")).toHaveLength(3);
  });

  it("完了後のホストにも作業ボードや全員のデータ削除を表示しない", async () => {
    const idea = buildNote({
      id: "99999999-9999-4999-8999-999999999999",
      content: "案",
    });
    const onLeave = vi.fn();
    setup({
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      decision: buildDecision({ phase: 3, noteId: idea.id }),
      outcomePublished: true,
      hmwDecidedIssue: "課題",
      decidedHmw: "問い",
      isHost: true,
      onLeave,
    });
    expect(
      screen.queryByRole("button", { name: "ボードへ戻る" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ルームを削除|ルームを解散/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "チームで決めた成果" }),
    ).toBeVisible();
    expect(onLeave).not.toHaveBeenCalled();
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

  it("タイマー設定中に空白ボードをクリックすると閉じ、ボード操作を開始しない", () => {
    const notes = buildNotes(2);
    const interactions = buildInteractions(notes, []);
    const onNoteDecide = vi.fn();
    setup({ isHost: true, notes, interactions, onNoteDecide });
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(screen.getByTestId("room-timer-panel")).toBeInTheDocument();

    const canvas = screen.getByTestId("board-canvas");
    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 1,
      clientX: 320,
      clientY: 240,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      pointerId: 1,
      clientX: 320,
      clientY: 240,
    });
    fireEvent.click(canvas);

    expect(screen.queryByTestId("room-timer-panel")).not.toBeInTheDocument();
    expect(interactions.onCanvasPointerDown).not.toHaveBeenCalled();
    expect(interactions.onCanvasPointerEnd).not.toHaveBeenCalled();
    expect(interactions.onNoteDragStart).not.toHaveBeenCalled();
    expect(interactions.onPrivateNoteDragStart).not.toHaveBeenCalled();
    expect(onNoteDecide).not.toHaveBeenCalled();
  });

  it("タイマー設定中の最初の採用クリックはパネルを閉じるだけにする", async () => {
    const onNoteDecide = vi.fn();
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      onNoteDecide,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
    );
    const decide = screen.getAllByRole("button", {
      name: /採用する付箋:/,
    })[0];
    await userEvent.click(screen.getByTestId("room-timer"));
    expect(screen.getByTestId("room-timer-panel")).toBeInTheDocument();

    await userEvent.click(decide);

    expect(screen.queryByTestId("room-timer-panel")).not.toBeInTheDocument();
    expect(onNoteDecide).not.toHaveBeenCalled();
  });

  it("host の招待URLと招待コードは招待ボタンから表示する", () => {
    setup({
      isHost: true,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://idea-flow.example/invite/ZZ99XX",
    });

    expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "招待" }));

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

  it("現在のズーム倍率を表示し、表示操作をそれぞれの処理へ渡す", () => {
    const interactions = buildInteractions(buildNotes(3), []);
    interactions.camera = { x: 40, y: -20, zoom: 1.25 };
    setup({ interactions });

    const reset = screen.getByRole("button", { name: "ズームを100%に戻す" });
    expect(reset).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "キャンバスを拡大" }));
    expect(interactions.onZoomIn).toHaveBeenCalledOnce();
    expect(interactions.onZoomOut).not.toHaveBeenCalled();
    expect(interactions.onResetZoom).not.toHaveBeenCalled();
    expect(interactions.onFitToNotes).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "キャンバスを縮小" }));
    expect(interactions.onZoomOut).toHaveBeenCalledOnce();
    expect(interactions.onResetZoom).not.toHaveBeenCalled();
    expect(interactions.onFitToNotes).not.toHaveBeenCalled();
    fireEvent.click(reset);
    expect(interactions.onResetZoom).toHaveBeenCalledOnce();
    expect(interactions.onFitToNotes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "付箋全体を表示" }));
    expect(interactions.onZoomIn).toHaveBeenCalledOnce();
    expect(interactions.onZoomOut).toHaveBeenCalledOnce();
    expect(interactions.onResetZoom).toHaveBeenCalledOnce();
    expect(interactions.onFitToNotes).toHaveBeenCalledOnce();
  });

  it("ツールバーの付箋追加ボタンでonAddPrivateNoteを呼ぶ", () => {
    const onAddPrivateNote = vi.fn();
    setup({
      phase: buildPhaseStep(1),
      onAddPrivateNote,
    });

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(onAddPrivateNote).toHaveBeenCalledTimes(1);
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
  });

  it("投票ステップの案内とパレットで対象・基準・操作を揃えて表示する", () => {
    // PRD 6.2 の投票対象・判断基準・操作説明は、誤投票を防ぐ要件として残す。
    setup({
      phase: buildPhaseStep(4),
      isHost: true,
      help: {
        kind: null,
        isOpen: true,
        tab: "write",
        onOpenChange: vi.fn(),
        onTabChange: vi.fn(),
      },
    });

    const dialog = screen.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    expect(
      within(dialog).getByText("投票対象は現在のフェーズの個々の付箋です。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("主観は「激しく共感する、取り組みたい」。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("客観は「自分以外の人にも価値がありそう」。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "主観1票・客観3票を、シールをドラッグするか選択して投票対象の付箋へ貼ります。",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("貼ったシールを押すと、投票を1票取り消せます。"),
    ).toBeInTheDocument();

    const palette = screen.getByRole("region", { name: "投票パレット" });
    expect(palette).toHaveAccessibleDescription(
      /投票対象は現在のフェーズの個々の付箋です。/,
    );
    expect(
      within(palette).getByText("主観は「激しく共感する、取り組みたい」。"),
    ).toBeVisible();
    expect(
      within(palette).getByText("客観は「自分以外の人にも価値がありそう」。"),
    ).toBeVisible();
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
    fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
      buttons: 1,
      pointerId: 9,
      clientX: 280,
      clientY: 80,
    });
    fireEvent.pointerUp(screen.getByTestId("room-board-view-root"), {
      pointerId: 9,
      clientX: 150,
      clientY: 175,
    });

    expect(onNoteVote).toHaveBeenCalledWith("note-1", "objective", 0.25, 0.5);
  });

  it("候補外へのドロップは理由を通知し、票を消費しない", () => {
    const notify = vi.spyOn(toast, "error");
    const onNoteVote = vi.fn();
    setup({
      phase: buildPhaseStep(4),
      notes: [buildNote({ id: "note-1", excluded: true })],
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
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => note),
    });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
      { pointerId: 9, clientX: 320, clientY: 24 },
    );
    fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
      buttons: 1,
      pointerId: 9,
      clientX: 280,
      clientY: 80,
    });
    fireEvent.pointerUp(screen.getByTestId("room-board-view-root"), {
      pointerId: 9,
      clientX: 150,
      clientY: 175,
    });

    expect(onNoteVote).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("候補外の付箋には投票できません"),
      expect.objectContaining({ id: "excluded-note-vote" }),
    );
    expect(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "主観シール 残り1票" }),
    ).toBeEnabled();
    notify.mockRestore();
  });

  it("パレットで選択したシールをマウスへ追従させ、付箋へ連続で貼る", () => {
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

    const paletteSticker = screen.getByRole("button", {
      name: "客観シール 残り3票",
    });
    fireEvent.click(paletteSticker, { clientX: 320, clientY: 24 });

    expect(paletteSticker).toHaveAttribute("aria-pressed", "true");

    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerType: "mouse",
      clientX: 150,
      clientY: 175,
    });

    const cursorSticker = screen.getByTestId("vote-stamp-cursor");
    expect(
      within(cursorSticker).getByTestId("dot-vote-sticker-image-objective"),
    ).toBeInTheDocument();
    expect(cursorSticker).toHaveStyle({
      left: "150px",
      top: "175px",
    });

    const surface = within(note).getByRole("button", { name: /付箋/ });
    fireEvent.click(surface, { clientX: 150, clientY: 175 });
    fireEvent.click(surface, { clientX: 250, clientY: 130 });

    expect(onNoteVote).toHaveBeenNthCalledWith(
      1,
      "note-1",
      "objective",
      0.25,
      0.5,
    );
    expect(onNoteVote).toHaveBeenNthCalledWith(
      2,
      "note-1",
      "objective",
      0.75,
      0.2,
    );
    expect(paletteSticker).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    buildPhaseStep(4),
    buildPhaseStep(3, 2),
    buildPhaseStep(4, 3),
  ])("投票ステップ %j で候補外へのクリックは理由を通知し、残票とシール選択を保つ", (phase) => {
    const notify = vi.spyOn(toast, "error");
    const onNoteVote = vi.fn();
    setup({
      phase,
      notes: [buildNote({ id: "note-1", excluded: true })],
      onNoteVote,
    });
    vi.spyOn(
      screen.getByTestId("note-card"),
      "getBoundingClientRect",
    ).mockReturnValue({
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

    fireEvent.click(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
      { clientX: 320, clientY: 24 },
    );
    fireEvent.click(screen.getByRole("button", { name: "候補外の付箋" }), {
      clientX: 150,
      clientY: 175,
    });

    expect(onNoteVote).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("候補外の付箋には投票できません"),
      expect.objectContaining({ id: "excluded-note-vote" }),
    );
    expect(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "主観シール 残り1票" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "客観シール 残り3票" }),
    ).toHaveAttribute("aria-pressed", "true");
    notify.mockRestore();
  });

  it("選択中のシールは同じボタンの再クリックまたはEscapeで解除する", () => {
    setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
    const paletteSticker = screen.getByRole("button", {
      name: "主観シール 残り1票",
    });

    fireEvent.click(paletteSticker, { clientX: 280, clientY: 24 });
    expect(paletteSticker).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(paletteSticker, { clientX: 280, clientY: 24 });
    expect(paletteSticker).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(paletteSticker, { clientX: 280, clientY: 24 });
    fireEvent.keyDown(screen.getByTestId("board-scroller"), { key: "Escape" });
    expect(paletteSticker).toHaveAttribute("aria-pressed", "false");
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
    fireEvent.pointerMove(screen.getByTestId("room-board-view-root"), {
      buttons: 1,
      pointerId: 9,
      clientX: 150,
      clientY: 175,
    });
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

    expect(onNoteVoteStickerMove).toHaveBeenCalledWith(
      stickerId,
      "note-2",
      0.25,
      0.5,
    );
  });

  it("貼ったシールを候補外へ移動しても元の票を維持して理由を通知する", () => {
    const notify = vi.spyOn(toast, "error");
    const onNoteVoteStickerMove = vi.fn();
    const stickerId = "33333333-3333-4333-8333-333333333333";
    const notes = [
      buildNotes(1)[0],
      {
        ...buildNotes(1)[0],
        id: "note-2",
        content: "移動先",
        excluded: true,
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

    const target = screen
      .getAllByTestId("note-card")
      .find((note) => note.dataset.noteId === "note-2");
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

    expect(onNoteVoteStickerMove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "客観シール 残り2票" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "客観シール 1票を1票取り消す" }),
    ).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("候補外の付箋には投票できません"),
      expect.objectContaining({ id: "excluded-note-vote" }),
    );
    notify.mockRestore();
  });

  it("自分のシールを投票パレットへ戻すと、既存のシール削除経路を呼ぶ", () => {
    const onNoteVoteStickerRemove = vi.fn();
    const stickerId = "33333333-3333-4333-8333-333333333333";
    const notes = [
      {
        ...buildNotes(1)[0],
        dotVotes: {
          subjective: { count: 0, votedByMe: false, ownCount: 0 },
          objective: { count: 1, votedByMe: true, ownCount: 1 },
        },
        dotVoteStickers: [
          { id: stickerId, kind: "objective" as const, x: 0.2, y: 0.3 },
        ],
      },
    ];
    setup({
      phase: buildPhaseStep(4),
      notes,
      onNoteVoteStickerRemove,
    });

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
      pointerId: 13,
      clientX: 140,
      clientY: 145,
    });
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 13,
      clientX: 320,
      clientY: 700,
    });

    expect(palette).toHaveAttribute("data-return-drop-target", "true");
    expect(palette).toHaveTextContent("戻すと1票取り消し");

    fireEvent.pointerUp(root, {
      pointerId: 13,
      clientX: 320,
      clientY: 700,
    });

    expect(onNoteVoteStickerRemove).toHaveBeenCalledTimes(1);
    expect(onNoteVoteStickerRemove).toHaveBeenCalledWith(stickerId);
  });

  it("投票シールをパレット以外の無効位置へドロップしても何もしない", () => {
    const onNoteVoteStickerRemove = vi.fn();
    const onNoteVoteStickerMove = vi.fn();
    const stickerId = "33333333-3333-4333-8333-333333333333";
    const notes = [
      {
        ...buildNotes(1)[0],
        dotVotes: {
          subjective: { count: 0, votedByMe: false, ownCount: 0 },
          objective: { count: 1, votedByMe: true, ownCount: 1 },
        },
        dotVoteStickers: [
          { id: stickerId, kind: "objective" as const, x: 0.2, y: 0.3 },
        ],
      },
    ];
    setup({
      phase: buildPhaseStep(4),
      notes,
      onNoteVoteStickerRemove,
      onNoteVoteStickerMove,
    });

    const sticker = screen.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    const root = screen.getByTestId("room-board-view-root");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => root,
    });

    fireEvent.pointerDown(sticker, {
      pointerId: 14,
      clientX: 140,
      clientY: 145,
    });
    fireEvent.pointerMove(root, {
      buttons: 1,
      pointerId: 14,
      clientX: 320,
      clientY: 700,
    });
    fireEvent.pointerUp(root, {
      pointerId: 14,
      clientX: 320,
      clientY: 700,
    });

    expect(onNoteVoteStickerRemove).not.toHaveBeenCalled();
    expect(onNoteVoteStickerMove).not.toHaveBeenCalled();
  });

  it("Step 1-4 のホストは Step 1-5 へ進める", () => {
    setup({ isHost: true, phase: buildPhaseStep(4) });

    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).not.toBeDisabled();
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

  describe("接続状態の表示", () => {
    it("接続確立中は接続中の表示を出す（loading）", () => {
      setup({ connectionStatus: "connecting" });

      expect(screen.getByRole("status")).toHaveTextContent("再接続");
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
      setup({ phase: buildPhaseStep(1), connectionStatus: "open" });

      expect(
        screen.getByRole("button", { name: "付箋を追加" }),
      ).not.toBeDisabled();
    });

    it("closedの間は付箋をクリックしても選択されない", () => {
      setup({ connectionStatus: "closed" });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);

      expect(first).not.toHaveAttribute("data-selected");
    });
  });

  describe("付箋の選択", () => {
    it("移動可能フェーズでは選択した付箋を永続的に最前面へ移すよう通知する", () => {
      const onNoteBringToFront = vi.fn();
      setup({
        phase: buildPhaseStep(2),
        onNoteBringToFront,
      });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);

      expect(first).toHaveAttribute("data-selected", "true");
      expect(onNoteBringToFront).toHaveBeenCalledWith("note-1");
    });

    it("移動不可フェーズでも選択できるが、最前面への移動は通知しない", () => {
      const onNoteBringToFront = vi.fn();
      setup({
        phase: buildPhaseStep(4),
        notes: [buildNote({ id: "note-1", stackOrder: 1 })],
        onNoteBringToFront,
      });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);

      expect(first).toHaveAttribute("data-selected", "true");
      expect(first.parentElement).toHaveStyle({ zIndex: "1" });
      expect(onNoteBringToFront).not.toHaveBeenCalled();
    });

    it("移動可能フェーズでも個人付箋の選択では最前面への移動を通知しない", () => {
      const onNoteBringToFront = vi.fn();
      const privateNote = buildNote({
        id: "private-note",
        visibility: "private",
        content: "個人付箋",
      });
      setup({
        phase: buildPhaseStep(2),
        notes: [],
        interactions: buildInteractions([], [privateNote]),
        onNoteBringToFront,
      });
      fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));

      const card = within(
        screen.getByTestId("private-notes-toolbar"),
      ).getByTestId("note-card");
      clickNote(card);

      expect(card).toHaveAttribute("data-selected", "true");
      expect(onNoteBringToFront).not.toHaveBeenCalled();
    });

    it("付箋をクリックすると選択され、ボード背景のクリックで解除される", () => {
      setup();

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      expect(first).toHaveAttribute("data-selected", "true");

      fireEvent.pointerDown(screen.getByTestId("board-canvas"), {
        pointerId: 1,
        button: 0,
        pointerType: "mouse",
        isPrimary: true,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerUp(screen.getByTestId("board-canvas"), {
        pointerId: 1,
        clientX: 20,
        clientY: 20,
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
      setup({ phase: buildPhaseStep(2) });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      clickNote(first);

      expect(within(first).getByRole("textbox")).toHaveFocus();
    });

    it("付箋を1回クリックして選択後に文字を打つと、その文字から編集を開始する", () => {
      setup({
        phase: buildPhaseStep(2),
        notes: [buildNote({ content: "既存の本文" })],
      });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      fireEvent.keyDown(getNoteSurface(first), { key: "a" });

      const textarea = within(first).getByRole("textbox");
      expect(textarea).toHaveFocus();
      expect(textarea).not.toHaveAttribute("readonly");
      expect(textarea).toHaveValue("既存の本文a");
    });

    it("選択中の付箋でBackspaceを押すと個人中の共有済み付箋は削除しない", () => {
      const onNoteDelete = vi.fn();
      setup({ onNoteDelete });

      const [first] = screen.getAllByTestId("note-card");
      clickNote(first);
      fireEvent.keyDown(getNoteSurface(first), { key: "Backspace" });

      expect(onNoteDelete).not.toHaveBeenCalledWith("note-1");
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

    it("Step 1-5 は未決定なら次への操作を無効にする", () => {
      setup({ isHost: true, phase: buildPhaseStep(5), decision: null });

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
    it("個人執筆中は共有済み付箋を隠し、個人付箋の入力を表示する", () => {
      const sharedNote = buildNote({
        id: "shared-note",
        content: "共有済みの付箋",
        visibility: "shared",
      });
      const privateNote = buildNote({
        id: "private-note",
        content: "自分だけの付箋",
        visibility: "private",
      });
      setup({
        phase: buildPhaseStep(1),
        notes: [sharedNote],
        interactions: buildInteractions([sharedNote], [privateNote]),
      });

      expect(
        screen.queryByDisplayValue("共有済みの付箋"),
      ).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("自分だけの付箋")).toBeInTheDocument();
      expect(screen.queryByTestId("board-scroller")).not.toBeInTheDocument();
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

    it("Step1-5ではパレットを閉じ、0票の結果表示を省略する", () => {
      setup({
        phase: buildPhaseStep(5),
      });

      expect(
        screen.queryByRole("region", { name: "投票パレット" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: "主観シール 0票" }),
      ).not.toBeInTheDocument();
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
});

describe("ステップに結び付いた決定事項", () => {
  it("決定した課題を左上の閉じた参照欄に残し、ガイドは独立した枠に表示する", () => {
    setup({
      phase: buildPhaseStep(1, 2),
      hmwDecidedIssue: "忘れ物を減らしたい",
      decidedHmw: null,
    });

    const hud = screen.getByTestId("board-context-hud");
    const reference = screen.getByTestId("board-reference-issue");
    const guide = screen.getByRole("region", {
      name: "ファシリテーションガイド",
    });

    expect(hud).toContainElement(reference);
    expect(reference).toHaveAttribute("data-open", "false");
    expect(screen.getByText("忘れ物を減らしたい")).not.toBeVisible();
    expect(hud).not.toContainElement(guide);
  });

  it("問いの作成では進め方と採用した課題を同時に読める", () => {
    setup({
      phase: buildPhaseStep(1, 2),
      hmwDecidedIssue: "忘れ物を減らしたい",
      decidedHmw: null,
    });
    expect(
      screen.getByRole("region", { name: "ファシリテーションガイド" }),
    ).toBeVisible();
    expect(screen.getByText("忘れ物を減らしたい")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
    expect(screen.getByText("忘れ物を減らしたい")).toBeVisible();
    expect(
      screen.queryByRole("tab", { name: /決定事項/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.getByText("忘れ物を減らしたい")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    expect(
      screen.getByRole("region", { name: "ファシリテーションガイド" }),
    ).toBeVisible();
  });
  it("アイデア作成では問いを開いて始め、元の課題も独立して開閉できる", () => {
    setup({
      phase: buildPhaseStep(1, 3),
      hmwDecidedIssue: "全員が安心して意見を出せない",
      decidedHmw: "どうすれば全員が安心して話せるだろうか？",
    });
    expect(
      screen.getByText("どうすれば全員が安心して話せるだろうか？"),
    ).not.toBeVisible();
    expect(screen.getByText("全員が安心して意見を出せない")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "決定した問い" }));
    expect(
      screen.getByText("どうすれば全員が安心して話せるだろうか？"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
    expect(screen.getByText("全員が安心して意見を出せない")).toBeVisible();
    expect(screen.getByTestId("step-guide")).toHaveAttribute(
      "data-state",
      "compact",
    );
    fireEvent.click(document.body);
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    expect(screen.getByText("全員が安心して意見を出せない")).toBeVisible();
    expect(
      screen.getByText("どうすれば全員が安心して話せるだろうか？"),
    ).not.toBeVisible();
  });
  it("ステップ移行後は参照欄を初期状態に戻し、次フェーズの執筆では問いを開く", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(1, 2),
      hmwDecidedIssue: "採用した課題",
      decidedHmw: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
    expect(screen.getByText("採用した課題")).toBeVisible();
    rerender(<TestBoardView {...props} phase={buildPhaseStep(2, 2)} />);
    expect(screen.getByText("採用した課題")).not.toBeVisible();
    rerender(
      <TestBoardView
        {...props}
        phase={buildPhaseStep(1, 3)}
        decidedHmw="採用した問い"
      />,
    );
    expect(screen.getByText("採用した問い")).not.toBeVisible();
    expect(screen.getByText("採用した課題")).not.toBeVisible();
  });
  it("持ち越しのないフェーズでは空の決定事項を表示しない", () => {
    setup({
      phase: buildPhaseStep(1),
      hmwDecidedIssue: null,
      decidedHmw: null,
    });
    expect(screen.queryByText("決定した課題")).not.toBeInTheDocument();
    expect(screen.queryByText("決定した問い")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "ファシリテーションガイド" }),
    ).toBeVisible();
  });
});

describe("反復ワークフロー", () => {
  it.each([
    [1, 2],
    [1, 3],
    [2, 2],
    [3, 2],
    [3, 3],
  ] as const)("%i-%iで追加作業を下中央から確認する", (phase, step) => {
    setup({ phase: buildPhaseStep(step, phase), isHost: true });
    fireEvent.click(screen.getByRole("button", { name: "もう一度付箋を書く" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "共有済み付箋と下書きは残ります",
    );
    expect(
      screen.getByRole("button", { name: "個人作業へ戻る" }),
    ).toBeEnabled();
  });
  it("採用前は次への操作を無効にして再投票を確認できる", () => {
    setup({ phase: buildPhaseStep(5), isHost: true });
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "もう一度投票する" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "付箋は消えません",
    );
  });
  it.each([
    [1, 5, "付箋"],
    [2, 4, "問い"],
    [3, 5, "アイデア"],
  ] as const)("%i-%iでは候補を選ぶと確認ダイアログなしで採用する", (phase, step, label) => {
    const { props } = setup({
      phase: buildPhaseStep(step, phase),
      isHost: true,
      notes: [buildNote({ id: "candidate", content: "選んだ候補" })],
    });
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    expect(props.onNoteDecide).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: `採用する${label}: 選んだ候補` }),
    );
    expect(props.onNoteDecide).toHaveBeenCalledExactlyOnceWith("candidate");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "選択をキャンセル" }),
    ).not.toBeInTheDocument();
  });
});

it("同じ決定ステップのsnapshot更新では結果一覧を再表示しない", () => {
  const { props, rerender } = setup({ phase: buildPhaseStep(5), isHost: true });
  rerender(
    <TestBoardView
      {...props}
      phase={{ ...props.phase }}
      decision={buildDecision()}
    />,
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

function notificationFixture(): { toaster: HTMLElement; toast: HTMLElement } {
  const toaster = document.createElement("ol");
  toaster.setAttribute("data-sonner-toaster", "true");
  toaster.style.bottom = "32px";
  const toast = document.createElement("li");
  for (const [name, value] of Object.entries({
    "data-sonner-toast": "true",
    "data-visible": "true",
    "data-removed": "false",
    "data-y-position": "bottom",
  }))
    toast.setAttribute(name, value);
  toaster.append(toast);
  document.body.append(toaster);
  return { toaster, toast };
}

describe("通知の寸法観測", () => {
  it("寸法観測APIがない環境でもボードと通知の余白を表示する", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { toaster, toast } = notificationFixture();
    let toastHeight = 80;
    Object.defineProperty(toast, "offsetHeight", { get: () => toastHeight });
    try {
      setup();
      const board = screen.getByTestId("room-board-view-root");
      expect(board.style.getPropertyValue("--board-notification-inset")).toBe(
        "128px",
      );
      toaster.style.bottom = "48px";
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(board.style.getPropertyValue("--board-notification-inset")).toBe(
        "144px",
      );
      toastHeight = 100;
      fireEvent(window, new Event("resize"));
      expect(board.style.getPropertyValue("--board-notification-inset")).toBe(
        "164px",
      );
    } finally {
      toaster.remove();
    }
  });

  it("付箋や補助パネルのDOM更新では通知のlayoutを再計測しない", async () => {
    const { toaster } = notificationFixture();
    const computed = vi.spyOn(window, "getComputedStyle");
    try {
      setup({ hmwDecidedIssue: "採用した課題" });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      computed.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(
        computed.mock.calls.filter(([element]) => element === toaster),
      ).toHaveLength(0);
    } finally {
      computed.mockRestore();
      toaster.remove();
    }
  });
  it("通知を削除したら寸法観測を解除する", async () => {
    const observe = vi.fn(),
      unobserve = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect(): void {}
      },
    );
    const { toaster, toast } = notificationFixture();
    try {
      setup();
      expect(observe).toHaveBeenCalledWith(toast);
      toast.remove();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(unobserve).toHaveBeenCalledWith(toast);
    } finally {
      toaster.remove();
    }
  });
});

describe("U13 通常入口の統合", () => {
  it.each([
    true,
    false,
  ])("公開後の本人退出はcancelで成果を保ちconfirm一回・pendingで二重送信しない host=%s", async (isHost) => {
    const idea = buildNote({ id: "idea", content: "採用案" });
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      isHost,
      hmwDecidedIssue: "課題",
      decidedHmw: "問い",
    });
    const published = {
      ...props,
      decision: buildDecision({ phase: 3, noteId: idea.id }),
      outcomePublished: true,
    };
    rerender(<TestBoardView {...published} />);
    await userEvent.click(
      screen.getByRole("button", { name: "退出してホームへ" }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent("退出しますか？");
    await userEvent.click(
      screen.getByRole("button", { name: "退出をやめて成果へ戻る" }),
    );
    expect(props.onLeave).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "チームで決めた成果" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "退出してホームへ" }),
    );
    await userEvent.click(screen.getByTestId("leave-confirm-action"));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    rerender(<TestBoardView {...published} isLeaving />);
    expect(screen.getByTestId("leave-confirm-action")).toBeDisabled();
    fireEvent.click(screen.getByTestId("leave-confirm-action"));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    rerender(<TestBoardView {...published} />);
    expect(screen.getByTestId("leave-confirm-action")).not.toBeDisabled();
  });

  it("確認中に公開されたら古い解散確認を本人退出に切り替える", async () => {
    const idea = buildNote({ id: "idea", content: "採用案" });
    const { props, rerender } = setup({
      phase: buildPhaseStep(5, 3),
      notes: [idea],
      isHost: true,
      decision: buildDecision({ phase: 3, noteId: idea.id }),
      hmwDecidedIssue: "課題",
      decidedHmw: "問い",
    });
    openRoomMenu();
    await userEvent.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "ルームを解散しますか？",
    );
    rerender(<TestBoardView {...props} outcomePublished />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("退出しますか？");
    expect(
      screen.queryByRole("button", { name: "ルームを解散" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("leave-confirm-action"));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("3-1 hint一回でマイ付箋を開き本文を編集でき、空付箋を増やさない", async () => {
    const phase = 3 as const;
    const privateNote = buildNote({
      id: "private-template",
      visibility: "private",
      authorId: ME,
      content: "もっと簡単に",
    });
    const { props, rerender } = setup({
      phase: buildPhaseStep(1, phase),
      notes: [],
      interactions: buildInteractions([], []),
    });
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "もっと簡単に" }));
    const callback = props.onIdeaHintSelect;
    expect(callback).toHaveBeenCalledExactlyOnceWith("もっと簡単に");
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(props.onAddPrivateNote).not.toHaveBeenCalled();
    rerender(
      <TestBoardView
        {...props}
        notes={[privateNote]}
        interactions={buildInteractions([], [privateNote])}
      />,
    );
    const card = within(
      screen.getByTestId("private-notes-toolbar"),
    ).getByTestId("note-card");
    expect(card).not.toBeNull();
    fireEvent.keyDown(
      within(card as HTMLElement).getByRole("button", { name: /付箋/ }),
      { key: "Enter" },
    );
    const textbox = within(card as HTMLElement).getByRole("textbox");
    fireEvent.change(textbox, {
      target: { value: "もっと簡単に入力できる" },
    });
    fireEvent.blur(textbox);
    expect(props.onPrivateNoteContentChange).toHaveBeenCalledWith(
      privateNote.id,
      "もっと簡単に入力できる",
    );
    expect(props.interactions.onResetZoom).not.toHaveBeenCalled();
  });
});

describe("fit HUDの可視境界", () => {
  it("長いhelp/privateのclip外本文と透過wrapperを占有に数えず、スクロール後も可視領域を使う", () => {
    const root = document.createElement("div");
    root.dataset.testid = "room-board-view-root";
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 390, 844);
    root.append(viewport);
    for (const edge of ["top", "bottom"]) {
      const wrapper = document.createElement("div");
      wrapper.dataset.boardFitEdge = edge;
      wrapper.style.pointerEvents = "none";
      wrapper.style.overflowX = "hidden";
      wrapper.style.overflowY = "hidden";
      wrapper.getBoundingClientRect = () =>
        new DOMRect(12, edge === "top" ? 12 : 650, 366, 140);
      const panel = document.createElement("div");
      panel.style.pointerEvents = "auto";
      panel.style.overflowX = "auto";
      panel.style.overflowY = "auto";
      panel.getBoundingClientRect = () =>
        new DOMRect(12, edge === "top" ? 12 : 300, 366, 1000);
      const content = document.createElement("button");
      content.style.pointerEvents = "auto";
      content.getBoundingClientRect = () =>
        new DOMRect(12, edge === "top" ? 500 : -300, 366, 1000);
      panel.append(content);
      wrapper.append(panel);
      root.append(wrapper);
    }
    document.body.append(root);
    try {
      expect(getBoardFitInsets(viewport)).toEqual({
        top: 152,
        right: 0,
        bottom: 194,
        left: 0,
      });
    } finally {
      root.remove();
    }
  });
});

describe("付箋上の投票結果", () => {
  it.each([
    [buildPhaseStep(4), buildPhaseStep(5)],
    [buildPhaseStep(3, 2), buildPhaseStep(4, 2)],
    [buildPhaseStep(4, 3), buildPhaseStep(5, 3)],
  ])("%jから決定へ進んでもモーダルを開かず、各付箋の集計を表示する", (voting, result) => {
    const notes = [
      buildNote({
        content: "比較する候補",
        dotVotes: {
          subjective: { count: 2, ownCount: 0, votedByMe: false },
          objective: { count: 3, ownCount: 0, votedByMe: false },
        },
      }),
    ];
    const { props, rerender } = setup({ phase: voting, notes, isHost: true });
    rerender(<TestBoardView {...props} phase={result} />);
    expect(
      screen.queryByRole("dialog", { name: "投票結果" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "投票結果を表示" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "主観シール 2票" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "客観シール 3票" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: /比較する候補/ }));
    expect(props.onNoteDecide).toHaveBeenCalledOnce();
  });
});

describe("ホスト世代をまたぐ古い操作を破棄する", () => {
  it("往復移譲で古い再投票確認を閉じ、前回の票を消さない", () => {
    const onRevote = vi.fn();
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      hostRevision: 0,
      onRevote,
    });
    fireEvent.click(screen.getByRole("button", { name: "もう一度投票する" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    rerender(<TestBoardView {...props} hostRevision={2} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onRevote).not.toHaveBeenCalled();
  });
  it("同一描画内の往復移譲でも古い採用選択をやめる", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      hostRevision: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    expect(
      screen.getByRole("button", { name: "選択をキャンセル" }),
    ).toBeInTheDocument();
    rerender(<TestBoardView {...props} hostRevision={2} />);
    expect(
      screen.queryByRole("button", { name: "選択をキャンセル" }),
    ).not.toBeInTheDocument();
    expect(props.onNoteDecide).not.toHaveBeenCalled();
  });
  it("ホスト変更送信中は再投票・採用を開始しない", () => {
    setup({ phase: buildPhaseStep(5), isHost: true, isTransferring: true });
    expect(
      screen.getByRole("button", { name: "もう一度投票する" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
    ).toBeDisabled();
  });
});

it("ホスト変更で採用hoverを破棄するとき旧権限の解除要求を送らない", () => {
  const oldFocus = vi.fn();
  const newFocus = vi.fn();
  const { props, rerender } = setup({
    phase: buildPhaseStep(5),
    isHost: true,
    hostRevision: 0,
    notes: [buildNote({ id: "note-1", content: "候補" })],
    onAdoptionFocusChange: oldFocus,
  });
  fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
  fireEvent.pointerEnter(
    screen.getByRole("button", { name: /採用する付箋: 候補/ }),
  );
  expect(oldFocus).toHaveBeenLastCalledWith("note-1");
  oldFocus.mockClear();
  rerender(
    <TestBoardView
      {...props}
      hostRevision={2}
      onAdoptionFocusChange={newFocus}
    />,
  );
  expect(oldFocus).not.toHaveBeenCalled();
  expect(newFocus).not.toHaveBeenCalled();
});

it("参加者が作業画面で選んだ成果の扱いを退出へ渡す", async () => {
  const onLeave = vi.fn();
  const user = userEvent.setup();
  setup({ isHost: false, onLeave });
  openRoomMenu();
  await user.click(screen.getByRole("button", { name: "退出する" }));
  await user.click(screen.getByRole("radio", { name: "成果を残さず退出" }));
  await user.click(screen.getByRole("button", { name: "成果を残さず退出" }));
  expect(onLeave).toHaveBeenCalledWith("discard");
});

// AT-001/004/006/007: 本人選択は共有・本文・工程コマンドと分離する。
describe("キャンバス入力の統合", () => {
  function prepare() {
    const notes = buildNotes(3);
    const interactions = buildInteractions(notes, []);
    interactions.onSharedNotesDragIntent = vi.fn();
    const result = setup({ notes, interactions, phase: buildPhaseStep(3) });
    const viewport = screen.getByTestId("board-scroller");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const cards = screen.getAllByTestId("note-card");
    cards.forEach((card, index) => {
      card.getBoundingClientRect = () =>
        new DOMRect(100 + index * 100, 100, 80, 80);
    });
    return { ...result, viewport, cards, interactions, notes };
  }
  function rectangle(viewport: HTMLElement) {
    fireEvent.pointerDown(viewport, {
      pointerId: 31,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 90,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 31,
      buttons: 1,
      clientX: 380,
      clientY: 180,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 31,
      clientX: 380,
      clientY: 180,
    });
  }
  it("3枚の矩形選択・Shift解除で集合と表示を揃え、矩形は前面化しない", () => {
    const { viewport, cards, props } = prepare();
    rectangle(viewport);
    expect(viewport).toHaveAttribute("data-selection-count", "3");
    expect(cards.every((card) => card.dataset.selected === "true")).toBe(true);
    expect(props.onNoteBringToFront).not.toHaveBeenCalled();
    const surface = getNoteSurface(cards[1]);
    fireEvent.pointerDown(surface, {
      pointerId: 32,
      button: 0,
      shiftKey: true,
    });
    fireEvent.pointerUp(surface, { pointerId: 32, shiftKey: true });
    expect(viewport).toHaveAttribute("data-selection-count", "2");
    expect(cards[1]).not.toHaveAttribute("data-selected");
  });
  it("複数選択dragは全対象intentだけを渡し、文字・Deleteを先頭の付箋へ適用しない", () => {
    const { viewport, cards, interactions, notes, props } = prepare();
    rectangle(viewport);
    const surface = getNoteSurface(cards[0]);
    fireEvent.keyDown(surface, { key: "Delete" });
    fireEvent.keyDown(surface, { key: "h" });
    expect(props.onNoteDelete).not.toHaveBeenCalled();
    expect(cards[0]).not.toHaveAttribute("data-editing");
    fireEvent.pointerDown(surface, {
      pointerId: 32,
      button: 0,
      buttons: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 32,
      buttons: 1,
      clientX: 125,
      clientY: 110,
    });
    expect(interactions.onSharedNotesDragIntent).toHaveBeenCalledWith(
      notes.map(({ id }) => id),
      expect.anything(),
      { clientX: 110, clientY: 110 },
      notes[0].id,
    );
    expect(interactions.onNoteDragStart).not.toHaveBeenCalled();
    expect(viewport).toHaveAttribute("data-selection-count", "3");
  });
  it("矩形のEscapeは選択を元に戻す1段だけで、次のEscapeで選択解除、その次でhandへ戻る", () => {
    const { viewport, cards } = prepare();
    clickNote(cards[2]);
    fireEvent.pointerDown(viewport, {
      pointerId: 31,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 90,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 31,
      buttons: 1,
      clientX: 380,
      clientY: 180,
    });
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(viewport).toHaveAttribute("data-selection-count", "1");
    expect(cards[2]).toHaveAttribute("data-selected", "true");
    fireEvent.pointerUp(viewport, {
      pointerId: 31,
      clientX: 380,
      clientY: 180,
    });
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(viewport).toHaveAttribute("data-selection-count", "0");
    fireEvent.keyDown(viewport, { key: "h" });
    expect(
      screen.getByRole("button", { name: "手のひらツール" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(screen.getByRole("button", { name: "選択ツール" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("手のひらは工程変更後も保持し、付箋Enterでは投票・編集しない", () => {
    const { viewport, cards, rerender, props } = prepare();
    fireEvent.keyDown(viewport, { key: "h" });
    fireEvent.keyDown(getNoteSurface(cards[0]), { key: "Enter" });
    expect(cards[0]).toHaveAttribute("data-selected", "true");
    expect(cards[0]).not.toHaveAttribute("data-editing");
    expect(props.onNoteVote).not.toHaveBeenCalled();
    rerender(<TestBoardView {...props} phase={buildPhaseStep(4)} />);
    expect(
      screen.getByRole("button", { name: "手のひらツール" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(viewport).toHaveAttribute("data-selection-count", "0");
  });
});

describe("投票pointer所有と取消", () => {
  it("貼ったシールdragをEscapeで取消し、同じup/clickを配送しても元票を取り消さない", () => {
    const stickerId = "33333333-3333-4333-8333-333333333333";
    const note = buildNote({
      dotVoteStickers: [{ id: stickerId, kind: "objective", x: 0.2, y: 0.3 }],
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 1, votedByMe: true, ownCount: 1 },
      },
    });
    const { props } = setup({ phase: buildPhaseStep(4), notes: [note] });
    const sticker = screen.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    fireEvent.pointerDown(sticker, {
      pointerId: 41,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(sticker, {
      pointerId: 41,
      buttons: 1,
      clientX: 150,
      clientY: 100,
    });
    fireEvent.keyDown(sticker, { key: "Escape" });
    fireEvent.pointerUp(sticker, { pointerId: 41, clientX: 150, clientY: 100 });
    fireEvent.click(sticker);
    expect(props.onNoteVoteStickerMove).not.toHaveBeenCalled();
    expect(props.onNoteVoteStickerRemove).not.toHaveBeenCalled();
    expect(props.onNoteVoteRemove).not.toHaveBeenCalled();
    expect(sticker).toBeInTheDocument();
  });
  it("パレットからのdragを別pointerで奪えず、重複upは1回だけ投票する", () => {
    const { props } = setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
    const note = screen.getByTestId("note-card");
    note.getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    const elementFromPoint = vi
      .spyOn(document, "elementFromPoint")
      .mockReturnValue(note);
    const palette = screen.getByRole("button", { name: "客観シール 残り3票" });
    fireEvent.pointerDown(palette, {
      pointerId: 41,
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerDown(palette, {
      pointerId: 42,
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 41,
      buttons: 1,
      clientX: 150,
      clientY: 175,
    });
    fireEvent.pointerUp(root, { pointerId: 42, clientX: 150, clientY: 175 });
    expect(props.onNoteVote).not.toHaveBeenCalled();
    fireEvent.pointerUp(root, { pointerId: 41, clientX: 150, clientY: 175 });
    fireEvent.pointerUp(root, { pointerId: 41, clientX: 150, clientY: 175 });
    expect(props.onNoteVote).toHaveBeenCalledTimes(1);
    expect(props.onNoteVote).toHaveBeenCalledWith(
      "note-1",
      "objective",
      0.25,
      0.5,
    );
    elementFromPoint.mockRestore();
  });
});

describe("AT-004: 所有gestureの取消経路", () => {
  it.each([
    "body",
    "toolbar",
  ])("private placeholder後の%s focusでもEscapeはdragだけを取消す", (focusTarget) => {
    const note = buildNote({
      id: "private-owned",
      authorId: ME,
      visibility: "private",
    });
    const interactions = buildInteractions([], [note]);
    const { props, rerender } = setup({
      notes: [],
      interactions,
      phase: buildPhaseStep(2),
    });
    fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));
    const card = screen.getByTestId("note-card");
    clickNote(card);
    getNoteSurface(card).focus();
    interactions.isNoteDragging = true;
    interactions.privateDropPlaceholder = { noteId: note.id };
    rerender(<TestBoardView {...props} interactions={interactions} />);
    expect(document.activeElement).toBe(document.body);
    const toolbar = screen.getByTestId("private-notes-scroll");
    if (focusTarget === "toolbar") {
      toolbar.tabIndex = -1;
      toolbar.focus();
    }
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(interactions.cancelCurrentNoteDrag).toHaveBeenCalledTimes(1);
    expect(interactions.cancelCurrentNoteDrag).toHaveBeenCalledWith(true);
    interactions.isNoteDragging = false;
    interactions.privateDropPlaceholder = undefined;
    rerender(<TestBoardView {...props} interactions={interactions} />);
    expect(screen.getByTestId("note-card")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(interactions.privateNotes).toEqual([note]);
  });
  it.each([
    "palette",
    "sticker",
  ])("%sの所有capture喪失は票を保持して取消し、古いup/clickは無効", (source) => {
    const note = buildNote({
      dotVoteStickers: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          kind: "objective",
          x: 0.2,
          y: 0.3,
        },
      ],
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 1, votedByMe: true, ownCount: 1 },
      },
    });
    const { props } = setup({ phase: buildPhaseStep(4), notes: [note] });
    const owner = screen.getByRole("button", {
      name:
        source === "palette"
          ? "客観シール 残り2票"
          : "客観シール 1票を1票取り消す",
    });
    const root = screen.getByTestId("room-board-view-root");
    const hand = screen.getByRole("button", { name: "手のひらツール" });
    const card = screen.getByTestId("note-card");
    card.getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    const hit = vi.fn(() => card);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: hit,
    });
    fireEvent.pointerDown(owner, {
      pointerId: 51,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(owner, {
      pointerId: 51,
      buttons: 1,
      clientX: 150,
      clientY: 150,
    });
    expect(hand).toBeDisabled();
    fireEvent.lostPointerCapture(owner, { pointerId: 52 });
    expect(hand).toBeDisabled();
    fireEvent.lostPointerCapture(owner, { pointerId: 51 });
    expect(hand).not.toBeDisabled();
    fireEvent.pointerUp(root, { pointerId: 51, clientX: 150, clientY: 150 });
    fireEvent.click(owner, { detail: 1 });
    fireEvent.click(owner, { detail: 1 });
    expect(
      screen.getByRole("button", { name: "客観シール 残り2票" }),
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(getNoteSurface(card), { detail: 1 });
    expect(props.onNoteVote).not.toHaveBeenCalled();
    expect(props.onNoteVoteStickerMove).not.toHaveBeenCalled();
    expect(props.onNoteVoteStickerRemove).not.toHaveBeenCalled();
    expect(props.onNoteVoteRemove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "客観シール 1票を1票取り消す" }),
    ).toBeInTheDocument();
    const palette = screen.getByRole("button", { name: "客観シール 残り2票" });
    fireEvent.pointerDown(palette, { pointerId: 53, button: 0, buttons: 1 });
    fireEvent.pointerUp(palette, { pointerId: 53 });
    fireEvent.click(palette);
    expect(palette).toHaveAttribute("aria-pressed", "true");
    hit.mockReset();
  });
});

it.each([
  "external",
  "details",
])("AT-004: 所有drag中でも%sのEscapeを奪わない", (surface) => {
  const interactions = buildInteractions([], []);
  interactions.isNoteDragging = true;
  setup({ notes: [], interactions });
  const external = document.createElement("button");
  document.body.append(external);
  const details = screen
    .getByLabelText("キャンバス操作のヒント")
    .closest("details");
  if (!details) throw new Error("操作ヒントdetailsが必要");
  details.open = true;
  const summary = details.querySelector("summary");
  if (!summary) throw new Error("操作ヒントsummaryが必要");
  const target = surface === "external" ? external : summary;
  target.focus();
  vi.mocked(interactions.cancelCurrentNoteDrag).mockClear();
  fireEvent.keyDown(target, { key: "Escape" });
  expect(interactions.cancelCurrentNoteDrag).not.toHaveBeenCalled();
  if (surface === "details") expect(details.open).toBe(false);
  external.remove();
});

it("AT-004: privateの閾値前pressをEscapeで取消した後move/upしてもdrag/editしない", () => {
  const note = buildNote({
    id: "private-pressed",
    authorId: ME,
    visibility: "private",
  });
  const interactions = buildInteractions([], [note]);
  setup({ notes: [], interactions, phase: buildPhaseStep(2) });
  fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));
  const card = screen.getByTestId("note-card");
  clickNote(card);
  const surface = getNoteSurface(card);
  surface.focus();
  fireEvent.pointerDown(surface, {
    pointerId: 61,
    button: 0,
    buttons: 1,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.keyDown(surface, { key: "Escape" });
  expect(card).toHaveAttribute("data-selected", "true");
  fireEvent.pointerMove(surface, {
    pointerId: 61,
    buttons: 1,
    clientX: 60,
    clientY: 50,
  });
  fireEvent.pointerUp(surface, { pointerId: 61, clientX: 60, clientY: 50 });
  expect(interactions.onPrivateNoteDragStart).not.toHaveBeenCalled();
  expect(card).not.toHaveAttribute("data-editing");
  fireEvent.click(screen.getByTestId("private-notes-scroll"), { detail: 1 });
  expect(card).toHaveAttribute("data-selected", "true");
});

describe("AT-002: private pressedの単一pointer所有", () => {
  function pressPrivate() {
    const note = buildNote({
      id: "private-owner",
      authorId: ME,
      visibility: "private",
    });
    const interactions = buildInteractions([], [note]);
    interactions.onGestureBlockedChange = vi.fn();
    const result = setup({ notes: [], interactions, phase: buildPhaseStep(2) });
    fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));
    const surface = getNoteSurface(screen.getByTestId("note-card"));
    surface.focus();
    fireEvent.pointerDown(surface, {
      pointerId: 71,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    return {
      ...result,
      interactions,
      surface,
      hand: screen.getByRole("button", { name: "手のひらツール" }),
    };
  }
  it("閾値前private pressはtool切替とcameraをロックし第二canvas touchを受理しない", () => {
    const { interactions, hand } = pressPrivate();
    expect(hand).toBeDisabled();
    expect(interactions.onGestureBlockedChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerDown(screen.getByTestId("board-scroller"), {
      pointerId: 72,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 500,
      clientY: 300,
    });
    expect(interactions.onCanvasPointerDown).not.toHaveBeenCalled();
    fireEvent.click(hand);
    expect(hand).toHaveAttribute("aria-pressed", "false");
  });
  it.each([
    "up",
    "cancel",
    "lost",
    "Escape",
    "blur",
    "phase",
  ])("%sでprivate所有を解放し取消後の古いmove/upでdragを再開しない", (ending) => {
    const { interactions, hand, surface, props, rerender } = pressPrivate();
    expect(hand).toBeDisabled();
    if (ending === "up") fireEvent.pointerUp(surface, { pointerId: 71 });
    else if (ending === "cancel")
      fireEvent.pointerCancel(surface, { pointerId: 71 });
    else if (ending === "lost") {
      fireEvent.lostPointerCapture(surface, { pointerId: 72 });
      expect(hand).toBeDisabled();
      fireEvent.lostPointerCapture(surface, { pointerId: 71 });
    } else if (ending === "Escape")
      fireEvent.keyDown(surface, { key: "Escape" });
    else if (ending === "blur") fireEvent(window, new Event("blur"));
    else rerender(<TestBoardView {...props} phase={buildPhaseStep(3)} />);
    expect(hand).not.toBeDisabled();
    fireEvent.pointerMove(surface, {
      pointerId: 71,
      buttons: 1,
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerUp(surface, { pointerId: 71, clientX: 60, clientY: 50 });
    expect(interactions.onPrivateNoteDragStart).not.toHaveBeenCalled();
  });
});

it("AT-002: private press取消後の新native HUD press/upは古pointer抑止を引き継がない", () => {
  const note = buildNote({
    id: "private-native",
    authorId: ME,
    visibility: "private",
  });
  const interactions = buildInteractions([], [note]);
  setup({ notes: [], interactions, phase: buildPhaseStep(2) });
  fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));
  const surface = getNoteSurface(screen.getByTestId("note-card"));
  surface.focus();
  fireEvent.pointerDown(surface, { pointerId: 1, button: 0, buttons: 1 });
  fireEvent.keyDown(surface, { key: "Escape" });
  const zoom = screen.getByRole("button", { name: "キャンバスを縮小" });
  fireEvent.pointerDown(zoom, { pointerId: 1, button: 0, buttons: 1 });
  expect(fireEvent.pointerUp(zoom, { pointerId: 1, cancelable: true })).toBe(
    true,
  );
  fireEvent.click(zoom, { detail: 1 });
  expect(interactions.onZoomOut).toHaveBeenCalledTimes(1);
});

describe("AT-002: 第一note所有中の第二palette入力", () => {
  it.each([
    "first",
    "second",
  ])("%sを先にreleaseしても棄却paletteのcapture/ghost/投票/旧clickは0", (releaseFirst) => {
    const { props } = setup({ phase: buildPhaseStep(4), notes: buildNotes(3) });
    const cards = screen.getAllByTestId("note-card");
    const surface = getNoteSurface(cards[0]);
    const palette = screen.getByRole("button", { name: "客観シール 残り3票" });
    const capture = vi.fn();
    palette.setPointerCapture = capture;
    cards[2].getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => cards[2]),
    });
    fireEvent.pointerDown(surface, {
      pointerId: 101,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerDown(palette, {
      pointerId: 102,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    expect(capture).not.toHaveBeenCalled();
    const root = screen.getByTestId("room-board-view-root");
    fireEvent.pointerMove(root, {
      pointerId: 102,
      buttons: 1,
      clientX: 200,
      clientY: 175,
    });
    expect(root.querySelector("[data-state='preview']")).toBeNull();
    const firstUp = () =>
      fireEvent.pointerUp(surface, {
        pointerId: 101,
        clientX: 10,
        clientY: 10,
      });
    const secondUp = () =>
      fireEvent.pointerUp(cards[2], {
        pointerId: 102,
        clientX: 200,
        clientY: 175,
      });
    if (releaseFirst === "first") {
      firstUp();
      secondUp();
    } else {
      secondUp();
      expect(
        screen.getByRole("button", { name: "手のひらツール" }),
      ).toBeDisabled();
      firstUp();
    }
    fireEvent.click(palette, { detail: 1 });
    fireEvent.click(palette, { detail: 1 });
    expect(palette).toHaveAttribute("aria-pressed", "false");
    expect(cards[0]).toHaveAttribute("data-selected", "true");
    expect(props.onNoteVote).not.toHaveBeenCalled();
    expect(props.onNoteVoteStickerMove).not.toHaveBeenCalled();
    expect(props.onNoteVoteStickerRemove).not.toHaveBeenCalled();
    fireEvent.pointerDown(palette, { pointerId: 103, button: 0, buttons: 1 });
    fireEvent.pointerUp(palette, { pointerId: 103 });
    fireEvent.click(palette, { detail: 1 });
    expect(palette).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(palette, { detail: 0 });
    expect(palette).toHaveAttribute("aria-pressed", "false");
  });
  it("第一press中はnative palette armingも配送せず、通常HUDのヒント操作は受理する", () => {
    setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
    const surface = getNoteSurface(screen.getByTestId("note-card"));
    const palette = screen.getByRole("button", { name: "客観シール 残り3票" });
    fireEvent.pointerDown(surface, { pointerId: 101, button: 0, buttons: 1 });
    fireEvent.click(palette, { detail: 0 });
    expect(palette).toHaveAttribute("aria-pressed", "false");
    const summary = screen.getByLabelText("キャンバス操作のヒント");
    expect(fireEvent.click(summary, { detail: 0 })).toBe(true);
    fireEvent.pointerUp(surface, { pointerId: 101 });
    fireEvent.click(palette, { detail: 0 });
    expect(palette).toHaveAttribute("aria-pressed", "true");
  });
});

it("AT-023: hand toolでも本人シールnative keyboard clickは1回取消す", () => {
  const note = buildNote({
    dotVoteStickers: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "objective",
        x: 0.2,
        y: 0.3,
      },
    ],
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 1, votedByMe: true, ownCount: 1 },
    },
  });
  const { props } = setup({ phase: buildPhaseStep(4), notes: [note] });
  fireEvent.click(screen.getByRole("button", { name: "手のひらツール" }), {
    detail: 0,
  });
  const sticker = screen.getByRole("button", {
    name: "客観シール 1票を1票取り消す",
  });
  fireEvent.click(sticker, { detail: 0 });
  expect(props.onNoteVoteStickerRemove).toHaveBeenCalledTimes(1);
  expect(props.onNoteVoteStickerRemove).toHaveBeenCalledWith(
    note.dotVoteStickers[0].id,
  );
});

it("AT-002: 棄却palette内spanのimplicit touch captureも失効する", () => {
  setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
  const surface = getNoteSurface(screen.getByTestId("note-card"));
  const palette = screen.getByRole("button", { name: "客観シール 残り3票" });
  const child = palette.querySelector("span");
  if (!child) throw new Error("palette内spanが必要");
  child.hasPointerCapture = vi.fn(() => true);
  child.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(surface, { pointerId: 201, button: 0, buttons: 1 });
  fireEvent.pointerDown(child, {
    pointerId: 202,
    pointerType: "touch",
    button: 0,
    buttons: 1,
  });
  expect(child.releasePointerCapture).toHaveBeenCalledWith(202);
});

describe("CI-IN002: active gesture中のnote custom semantic key", () => {
  it.each([
    "Enter",
    " ",
  ])("active sticker drag中の%sはvoteを配送せず、owner dropと終了後keyは有効", (key) => {
    const notes = buildNotes(3);
    notes[0] = {
      ...notes[0],
      dotVoteStickers: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          kind: "objective",
          x: 0.2,
          y: 0.3,
        },
      ],
      dotVotes: {
        subjective: { count: 0, ownCount: 0, votedByMe: false },
        objective: { count: 1, ownCount: 1, votedByMe: true },
      },
    };
    const { props } = setup({ phase: buildPhaseStep(4), notes });
    fireEvent.click(
      screen.getByRole("button", { name: "客観シール 残り2票" }),
      { detail: 0 },
    );
    const cards = screen.getAllByTestId("note-card");
    cards[2].getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => cards[2],
    });
    const owner = screen.getByRole("button", {
      name: "客観シール 1票を1票取り消す",
    });
    fireEvent.pointerDown(owner, {
      pointerId: 301,
      buttons: 1,
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(owner, {
      pointerId: 301,
      buttons: 1,
      clientX: 200,
      clientY: 175,
    });
    const surface = within(cards[2]).getByRole("button", { name: /付箋/ });
    expect(
      fireEvent.keyDown(surface, { key: "Enter", isComposing: true }),
    ).toBe(true);
    expect(fireEvent.keyDown(surface, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(owner, { key: " ", code: "Space" })).toBe(true);
    fireEvent.keyDown(surface, { key });
    expect(props.onNoteVote).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "手のひらツール" }),
    ).toBeDisabled();
    fireEvent.pointerUp(owner, { pointerId: 301, clientX: 200, clientY: 175 });
    expect(props.onNoteVoteStickerMove).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(surface, { key });
    expect(props.onNoteVote).toHaveBeenCalledTimes(1);
  });
});

it.each([
  { key: "f", ctrlKey: true },
  { key: "c", metaKey: true },
  { key: " ", altKey: true },
  { key: "F10" },
  { key: "Enter", ctrlKey: true },
  { key: " ", ctrlKey: true },
  { key: "Enter", metaKey: true },
  { key: " ", metaKey: true },
])("CI-IN002 native shortcut $key $ctrlKey $metaKey $altKeyはactiveでもdefaultと票を保持", (input) => {
  const { props } = setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
  fireEvent.click(screen.getByRole("button", { name: "客観シール 残り3票" }), {
    detail: 0,
  });
  props.interactions.isNoteDragging = true;
  screen.getByTestId("note-card").getBoundingClientRect = () =>
    new DOMRect(0, 0, 200, 150);
  const surface = within(screen.getByTestId("note-card")).getByRole("button", {
    name: /付箋/,
  });
  expect(fireEvent.keyDown(surface, input)).toBe(true);
  if (input.key === "Enter" || input.key === " ")
    fireEvent.click(surface, { detail: 0 });
  expect(props.onNoteVote).not.toHaveBeenCalled();
  expect(screen.getByTestId("note-card")).not.toHaveAttribute("data-editing");
});

it("CI-IN002 owner終了後の古いmodified Space clickは取消し新keydownは受理", () => {
  const { props } = setup({ phase: buildPhaseStep(4), notes: buildNotes(1) });
  const card = screen.getByTestId("note-card");
  card.getBoundingClientRect = () => new DOMRect(0, 0, 200, 150);
  fireEvent.click(screen.getByRole("button", { name: "客観シール 残り3票" }), {
    detail: 0,
  });
  const surface = within(card).getByRole("button", { name: /付箋/ });
  props.interactions.isNoteDragging = true;
  expect(
    fireEvent.keyDown(surface, { key: " ", code: "Space", ctrlKey: true }),
  ).toBe(true);
  props.interactions.isNoteDragging = false;
  expect(
    fireEvent.keyDown(surface, {
      key: " ",
      code: "Space",
      ctrlKey: true,
      repeat: true,
    }),
  ).toBe(true);
  fireEvent.keyUp(surface, { key: " ", code: "Space", ctrlKey: true });
  fireEvent.click(surface, { detail: 0 });
  expect(props.onNoteVote).not.toHaveBeenCalled();
  fireEvent.keyDown(surface, { key: "Enter" });
  expect(props.onNoteVote).toHaveBeenCalledTimes(1);
});

describe("CI-PHASE002: 採用semantic activationとgesture所有", () => {
  it.each([
    ["pan", "Enter"],
    ["pan", " "],
    ["note-drag", "Enter"],
    ["note-drag", " "],
  ])("%s中の%s採用は待ちとownerを保ち、旧up/repeatは0・freshは1", (owner, key) => {
    const { props } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      notes: buildNotes(3),
    });
    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    const target = screen.getByRole("button", { name: "採用する付箋: 付箋 2" });
    let active = true;
    props.interactions.hasPan = () => owner === "pan" && active;
    props.interactions.isNoteDragging = owner === "note-drag";
    expect(fireEvent.keyDown(target, { key: "f", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(target, { key: "Enter", isComposing: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(target, { key: "Tab" })).toBe(true);
    fireEvent.keyDown(target, { key });
    fireEvent.click(target, { detail: 0 });
    expect(props.onNoteDecide).not.toHaveBeenCalled();
    expect(target).toBeInTheDocument();
    expect(
      props.interactions.hasPan?.() || props.interactions.isNoteDragging,
    ).toBe(true);
    expect(fireEvent.keyDown(target, { key: " ", ctrlKey: true })).toBe(true);
    active = false;
    props.interactions.isNoteDragging = false;
    expect(
      fireEvent.keyDown(target, { key: " ", ctrlKey: true, repeat: true }),
    ).toBe(true);
    fireEvent.keyUp(target, { key: " ", ctrlKey: true });
    fireEvent.click(target, { detail: 0 });
    expect(props.onNoteDecide).not.toHaveBeenCalled();
    fireEvent.keyDown(target, { key });
    fireEvent.click(target, { detail: 0 });
    expect(props.onNoteDecide).toHaveBeenCalledTimes(1);
    expect(props.onNoteDecide).toHaveBeenCalledWith("note-2");
  });
});

describe("移動履歴の入口", () => {
  function history(pending = false) {
    return {
      undo: {
        label: "2枚の移動（note-a, note-b）",
        reason: null,
        disabled: false,
      },
      redo: { label: "1枚の移動（note-c）", reason: null, disabled: false },
      pending,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    };
  }
  it("ボタンとキャンバスのCtrl/Cmd+Zが履歴操作へ接続する", () => {
    const moveHistory = history();
    setup({ moveHistory });
    fireEvent.click(screen.getByRole("button", { name: "移動を元に戻す" }));
    fireEvent.click(screen.getByRole("button", { name: "移動をやり直す" }));
    const canvas = screen.getByTestId("board-scroller");
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    fireEvent.keyDown(canvas, { key: "Z", metaKey: true, shiftKey: true });
    expect(moveHistory.onUndo).toHaveBeenCalledTimes(2);
    expect(moveHistory.onRedo).toHaveBeenCalledTimes(2);
  });
  it("送信中はボタンとショートカットの多重操作を止める", () => {
    const moveHistory = history(true);
    setup({ moveHistory });
    expect(
      screen.getByRole("button", { name: "移動を元に戻す" }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId("board-scroller"), {
      key: "z",
      ctrlKey: true,
    });
    expect(moveHistory.onUndo).not.toHaveBeenCalled();
  });
  it.each([
    "input",
    "textarea",
    "select",
    "editable",
    "dialog",
    "IME",
    "repeat",
  ])("%sのnative操作を奪わない", (kind) => {
    const moveHistory = history();
    setup({ moveHistory });
    const canvas = screen.getByTestId("board-scroller");
    const element = document.createElement(
      ["input", "textarea", "select"].includes(kind) ? kind : "div",
    );
    if (kind === "editable") element.setAttribute("contenteditable", "true");
    if (kind === "dialog") element.setAttribute("role", "dialog");
    canvas.append(element);
    expect(
      fireEvent.keyDown(element, {
        key: "z",
        ctrlKey: true,
        isComposing: kind === "IME",
        repeat: kind === "repeat",
      }),
    ).toBe(true);
    expect(moveHistory.onUndo).not.toHaveBeenCalled();
  });
});

it("退出した作者の共有付箋に保持した呼び名を表示し、在籍中は最新名を優先する", () => {
  const [author] = buildMembers(1);
  const note = buildNote({ authorId: author.userId, visibility: "shared" });
  const { props, rerender } = setup({
    notes: [note],
    members: [],
    authorNames: new Map([[author.userId, "退出前の呼び名"]]),
  });
  expect(screen.getByTitle("作者: 退出前の呼び名")).toBeInTheDocument();
  rerender(
    <TestBoardView
      {...props}
      members={[{ ...author, name: "現在の呼び名" }]}
    />,
  );
  expect(screen.getByTitle("作者: 現在の呼び名")).toBeInTheDocument();
});
