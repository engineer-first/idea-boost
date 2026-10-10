import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import {
  buildDecision,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { getBoardPermissions } from "../logic/board-permissions";
import { RoomBoardCanvas } from "./room-board-canvas";

function setup(overrides: Partial<Parameters<typeof RoomBoardCanvas>[0]> = {}) {
  const props = {
    notes: buildNotes(2),
    groups: [],
    phase: buildPhaseStep(2),
    decision: null,
    isHost: false,
    permissions: getBoardPermissions(buildPhaseStep(2)),
    privateNotes: [],
    selectedNoteId: null,
    draggingNoteId: null,
    isDisconnected: false,
    voteRemaining: { subjective: 5, objective: 10 },
    selectedVoteKind: null,
    pendingVoteOperations: [],
    dragGhost: null,
    isReturnDropTarget: false,
    boardScrollerRef: createRef<HTMLDivElement>(),
    ideaMapPlaneRef: createRef<HTMLDivElement>(),
    privateToolbarRef: createRef<HTMLDivElement>(),
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: {},
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
    onSelect: vi.fn(),
    onNoteDragStart: vi.fn(),
    onNoteContentChange: vi.fn(),
    onNoteFontSizeChange: vi.fn(),
    onNoteDelete: vi.fn(),
    onNoteVote: vi.fn(),
    onNoteVoteRemove: vi.fn(),
    onNoteVoteStickerRemove: vi.fn(),
    onNoteVoteStickerDragStart: vi.fn(),
    isAdoptMode: false,
    adoptionFocusNoteId: null,
    onAdoptionFocusChange: vi.fn(),
    onAdoptNote: vi.fn(),
    onGroupCreate: vi.fn(),
    onGroupUpdateName: vi.fn(),
    onAddPrivateNote: vi.fn(),
    onPrivateNoteContentChange: vi.fn(),
    onPrivateNoteDelete: vi.fn(),
    onPrivateNoteDragStart: vi.fn(),
    remoteCursors: [],
    ...overrides,
  };
  const { rerender: rerenderView, unmount } = render(
    <RoomBoardCanvas {...props} />,
  );
  return {
    props,
    rerender: (element = <RoomBoardCanvas {...props} />) =>
      rerenderView(element),
    unmount,
  };
}

function openPrivateNotesToolbar() {
  const toolbar = screen.getByTestId("private-notes-toolbar");
  const openButton = within(toolbar).queryByRole("button", {
    name: "マイ付箋を開く",
  });
  if (openButton) fireEvent.click(openButton);
  return toolbar;
}

function hexColorToRgb(hexColor: string): string {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hexColor.slice(offset, offset + 2), 16),
  );
  return `rgb(${channels.join(", ")})`;
}

describe("RoomBoardCanvas", () => {
  it("自分の発表順を待っている間もマイ付箋をドラッグできる", () => {
    const onPrivateNoteDragStart = vi.fn();
    setup({
      phase: buildPhaseStep(2),
      permissions: getBoardPermissions(buildPhaseStep(2)),
      privateNotes: [buildNote({ id: "private-1", visibility: "private" })],
      canPublishPrivateNote: false,
      onPrivateNoteDragStart,
    });

    const toolbar = screen.getByTestId("private-notes-toolbar");
    fireEvent.click(
      within(toolbar).getByRole("button", { name: "マイ付箋を開く" }),
    );
    const note = within(toolbar).getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(note, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(note, {
      buttons: 1,
      pointerId: 1,
      clientX: 40,
      clientY: 40,
    });

    expect(onPrivateNoteDragStart).toHaveBeenCalledOnce();
  });

  it("ドラッグ権利の応答前もドラッグ中の候補操作を隠し、終了後に選択表示へ戻す", () => {
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      permissions: getBoardPermissions(buildPhaseStep(5)),
      isHost: true,
      selectedNoteId: "note-1",
      onNoteExclude: vi.fn(),
    });
    const action = screen.getAllByRole("button", { name: "候補から外す" })[0];
    expect(action).toHaveClass("opacity-100");
    rerender(<RoomBoardCanvas {...props} localDraggingNoteId="note-1" />);
    expect(action).toHaveClass("opacity-0");
    rerender();
    expect(action).toHaveClass("opacity-100");
  });

  it("文字サイズ操作をズーム操作とは別に左下へ置き、選択付箋だけを1px刻みで変更する", () => {
    const onNoteFontSizeChange = vi.fn();
    setup({
      phase: buildPhaseStep(2),
      permissions: getBoardPermissions(buildPhaseStep(2)),
      notes: [buildNote({ id: "note-1", fontSize: 14 })],
      selectedNoteId: "note-1",
      onNoteFontSizeChange,
    });

    const tools = screen.getByTestId("board-tools-hud");
    const fontControls = screen.getByTestId("note-font-size-controls");
    const zoomControls = screen.getByTestId("canvas-zoom-controls");
    expect(tools).toContainElement(fontControls);
    expect(fontControls).not.toContainElement(zoomControls);
    expect(
      screen.getByRole("group", { name: "選択した付箋の文字サイズ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("14px")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "付箋の文字を大きく" }));
    expect(onNoteFontSizeChange).toHaveBeenCalledWith("note-1", 15);
  });

  it("未選択・切断中・候補外では文字サイズ操作を無効にする", () => {
    const phase = buildPhaseStep(2);
    const { props, rerender } = setup({
      phase,
      permissions: getBoardPermissions(phase),
    });
    expect(
      screen.getByRole("button", { name: "付箋の文字を大きく" }),
    ).toBeDisabled();

    rerender(
      <RoomBoardCanvas {...props} selectedNoteId="note-1" isDisconnected />,
    );
    expect(
      screen.getByRole("button", { name: "付箋の文字を大きく" }),
    ).toBeDisabled();
  });

  it("編集不可のステップでは文字サイズ操作を表示しない", () => {
    const phase = buildPhaseStep(3);
    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(
      screen.queryByTestId("note-font-size-controls"),
    ).not.toBeInTheDocument();
  });

  it.each([
    [2, true],
    [3, true],
    [4, false],
    [5, false],
  ] as const)("3-%iでは調整可能なステップだけマップサイズ操作を表示する", (step, canResize) => {
    const phase = buildPhaseStep(step, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
    });

    const controls = screen.queryByTestId("idea-map-size-controls-hud");
    if (canResize) {
      expect(controls).toBeInTheDocument();
    } else {
      expect(controls).not.toBeInTheDocument();
    }
  });

  it("マップの広さ操作を既存の左下操作群から分離して画面下中央に置く", () => {
    const phase = buildPhaseStep(3, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
    });

    const existingTools = screen.getByTestId("board-tools-hud");
    const sizeControls = screen.getByTestId("idea-map-size-controls-hud");
    expect(existingTools).not.toContainElement(sizeControls);
    expect(
      within(sizeControls).getByRole("button", { name: "マップを広くする" }),
    ).toBeInTheDocument();
  });

  it("採用選択モードは候補だけを明示し、対象ボタンの操作を通知する", () => {
    const onAdoptNote = vi.fn();
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      isAdoptMode: true,
      onAdoptNote,
      notes: [
        buildNote({ id: "note-1", content: "候補A", visibility: "shared" }),
        buildNote({
          id: "note-2",
          content: "候補外B",
          visibility: "shared",
          excluded: true,
        }),
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "採用する付箋: 候補A" }),
    );
    expect(onAdoptNote).toHaveBeenCalledWith("note-1");
    expect(
      screen.queryByRole("button", { name: "採用する付箋: 候補外B" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("board-scroller")).toHaveAttribute(
      "data-adopt-mode",
      "true",
    );
  });

  it.each([
    buildPhaseStep(5),
    buildPhaseStep(4, 2),
    buildPhaseStep(5, 3),
  ])("%j の決定済み状態では別の候補も再採用できない", (phase) => {
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
      isAdoptMode: true,
      decision: buildDecision({ noteId: "note-1", phase: phase.phase }),
      notes: buildNotes(2),
    });
    expect(
      screen.queryByRole("button", { name: /採用する.+:/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    buildPhaseStep(5),
    buildPhaseStep(4, 2),
    buildPhaseStep(5, 3),
  ])("%j の採用選択中も切断・参加者・非共有の候補には採用領域を出さない", (phase) => {
    const { props, rerender } = setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
      isAdoptMode: true,
      notes: [buildNote({ visibility: "private" })],
    });
    const targets = () =>
      screen.queryAllByRole("button", { name: /採用する.+:/ });
    expect(targets()).toHaveLength(0);
    const notes = buildNotes(2);
    rerender(<RoomBoardCanvas {...props} notes={notes} isDisconnected />);
    expect(targets()).toHaveLength(0);
    rerender(<RoomBoardCanvas {...props} notes={notes} isHost={false} />);
    expect(targets()).toHaveLength(0);
    rerender(<RoomBoardCanvas {...props} notes={notes} />);
    expect(targets()).toHaveLength(2);
  });

  it("通常キャンバスの採用候補は通常時の枠を透明にし、hoverとfocus-visibleで緑枠を示す", () => {
    setup({
      phase: buildPhaseStep(5),
      isHost: true,
      isAdoptMode: true,
      notes: [
        buildNote({ content: "通常キャンバス候補", visibility: "shared" }),
      ],
    });

    expect(
      screen.getByRole("button", {
        name: "採用する付箋: 通常キャンバス候補",
      }),
    ).toHaveClass(
      "border-transparent",
      "hover:border-emerald-600",
      "focus-visible:border-emerald-600",
    );
  });

  it("アイデアマップの採用候補も通常時の枠を透明にし、hoverとfocus-visibleで緑枠を示す", () => {
    const phase = buildPhaseStep(5, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
      isAdoptMode: true,
      notes: [
        buildNote({ content: "アイデアマップ候補", visibility: "shared" }),
      ],
    });

    expect(
      screen.getByRole("button", {
        name: "採用するアイデア: アイデアマップ候補",
      }),
    ).toHaveClass(
      "border-transparent",
      "hover:border-emerald-600",
      "focus-visible:border-emerald-600",
    );
  });

  it.each([
    ["通常キャンバス", buildPhaseStep(5)],
    ["アイデアマップ", buildPhaseStep(5, 3)],
  ] as const)("%s の候補 hover・focus・離脱を即時通知する", (_label, phase) => {
    const onAdoptionFocusChange = vi.fn();
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
      isAdoptMode: true,
      notes: [
        buildNote({ id: "note-1", content: "候補", visibility: "shared" }),
      ],
      onAdoptionFocusChange,
    });
    const target = screen.getByRole("button", { name: /採用する.+: 候補/ });

    fireEvent.pointerEnter(target);
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith("note-1");
    fireEvent.pointerLeave(target);
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);
    fireEvent.focus(target);
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith("note-1");
    fireEvent.blur(target);
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith(null);
  });

  it("確定を取り消して選び直すと、前回のfocusではなく現在hover中の候補を通知する", () => {
    const onAdoptionFocusChange = vi.fn();
    const notes = [
      buildNote({ id: "note-1", content: "前回の候補", visibility: "shared" }),
      buildNote({ id: "note-2", content: "今回の候補", visibility: "shared" }),
    ];
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: true,
      isAdoptMode: true,
      notes,
      onAdoptionFocusChange,
    });

    fireEvent.focus(
      screen.getByRole("button", { name: "採用する付箋: 前回の候補" }),
    );
    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith("note-1");

    rerender(<RoomBoardCanvas {...props} isAdoptMode={false} />);
    rerender(<RoomBoardCanvas {...props} isAdoptMode />);
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "採用する付箋: 今回の候補" }),
    );

    expect(onAdoptionFocusChange).toHaveBeenLastCalledWith("note-2");
  });

  it("参加者だけに共有採用フォーカスを描画し、ホスト自身には重ねない", () => {
    const note = buildNote({ id: "note-1", visibility: "shared" });
    const { props, rerender } = setup({
      phase: buildPhaseStep(5),
      isHost: false,
      notes: [note],
      adoptionFocusNoteId: "note-1",
    });
    expect(screen.getByTestId("note-card")).toHaveAttribute(
      "data-adoption-focused",
      "true",
    );

    rerender(
      <RoomBoardCanvas {...props} isHost adoptionFocusNoteId="note-1" />,
    );
    expect(screen.getByTestId("note-card")).not.toHaveAttribute(
      "data-adoption-focused",
    );
  });

  it("非ホストにも確定済み付箋の緑枠とチェックを示す", () => {
    setup({
      phase: buildPhaseStep(5),
      isHost: false,
      decision: {
        phase: 1,
        noteId: "note-1",
        decidedBy: "11111111-1111-4111-8111-111111111111",
      },
      notes: [buildNote({ id: "note-1", visibility: "shared" })],
    });

    expect(screen.getByTestId("note-card")).toHaveClass(
      "outline-4",
      "outline-emerald-600",
    );
    expect(
      screen.getByRole("status", { name: "取り組む課題に決定済み" }),
    ).toBeInTheDocument();
  });

  it("scroller の pointer leave 座標を presence handler へ渡す", () => {
    const onPresencePointerLeave = vi.fn();
    setup({ onPresencePointerLeave });

    fireEvent.pointerLeave(screen.getByTestId("board-scroller"), {
      pointerId: 4,
      clientX: 650,
      clientY: 120,
    });

    expect(onPresencePointerLeave).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 650, clientY: 120 }),
    );
  });

  it("他ユーザーの名前付きカーソルを表示し、個人向け切り替え操作を表示しない", () => {
    setup({
      remoteCursors: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 120,
          y: 240,
          draggingNoteId: null,
          lastSeenAt: Date.now(),
          isIdle: false,
        },
      ],
    });

    expect(screen.getByText("Taro")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /参加者のカーソル/ }),
    ).not.toBeInTheDocument();
  });

  it("pointer captureを失ったらキャンバスのパンを終了する", () => {
    const { props } = setup();
    fireEvent.lostPointerCapture(screen.getByTestId("board-scroller"));

    expect(props.onCanvasPointerEnd).toHaveBeenCalledOnce();
  });

  it("パン・ズーム後の camera で board 座標を画面座標へ変換する", () => {
    setup({
      camera: { x: 30, y: -20, zoom: 2 },
      remoteCursors: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 100,
          y: 200,
          draggingNoteId: null,
          lastSeenAt: Date.now(),
          isIdle: false,
        },
      ],
    });

    expect(
      screen.getByTestId("remote-cursor-22222222-2222-4222-8222-222222222222"),
    ).toHaveStyle({ transform: "translate3d(230px, 380px, 0)" });
  });

  it("参加者が離脱しても残ったカーソルの名前ラベル位置を維持する", () => {
    const firstCursor = {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Taro",
      color: "green" as const,
      x: 100,
      y: 200,
      draggingNoteId: null,
      lastSeenAt: Date.now(),
      isIdle: false,
    };
    const remainingCursor = {
      userId: "33333333-3333-4333-8333-333333333333",
      name: "Hanako",
      color: "blue" as const,
      x: 100,
      y: 200,
      draggingNoteId: null,
      lastSeenAt: Date.now(),
      isIdle: false,
    };
    const { props, rerender } = setup({
      remoteCursors: [firstCursor, remainingCursor],
    });
    const labelTransform =
      screen.getByText("Hanako").parentElement?.style.transform;

    rerender(<RoomBoardCanvas {...props} remoteCursors={[remainingCursor]} />);

    expect(screen.getByText("Hanako").parentElement).toHaveStyle({
      transform: labelTransform,
    });
  });

  it("付箋操作マトリクスを表示する", () => {
    const phase = buildPhaseStep(2);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
    });

    expect(screen.getByTestId("board-operation-matrix")).toBeInTheDocument();
  });

  it("ステップ変更後も操作可否表示が最新の権限に追従する", () => {
    const firstStep = buildPhaseStep(2, 2);
    const secondStep = buildPhaseStep(3, 2);
    const { props, rerender } = setup({
      phase: firstStep,
      permissions: getBoardPermissions(firstStep),
    });

    expect(
      screen.getByRole("img", { name: "付箋の編集：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の移動：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の削除：不可" }),
    ).toBeInTheDocument();

    rerender(
      <RoomBoardCanvas
        {...props}
        phase={secondStep}
        permissions={getBoardPermissions(secondStep)}
      />,
    );

    expect(
      screen.getByRole("img", { name: "付箋の編集：不可" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の移動：不可" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の削除：不可" }),
    ).toBeInTheDocument();
  });
  it("個人入力では操作案内を隠し、共有・整理・投票では最新の操作可否を表示する", () => {
    const { props, rerender } = setup();
    for (const step of [1, 2, 3, 4]) {
      const phase = buildPhaseStep(step);
      const permissions = getBoardPermissions(phase);
      rerender(
        <RoomBoardCanvas {...props} phase={phase} permissions={permissions} />,
      );
      expect(screen.getAllByTestId("board-operation-matrix")).toHaveLength(1);
      expect(screen.queryByTestId("private-notes-toolbar") !== null).toBe(
        permissions.showPrivateToolbar,
      );
      if (step === 1) {
        expect(screen.getByTestId("board-operation-matrix")).not.toBeVisible();
        continue;
      }
      expect(screen.getByTestId("board-operation-matrix")).toBeVisible();
      for (const [label, enabled] of [
        ["編集", permissions.canEditNote],
        ["移動", permissions.canMoveNote],
        ["削除", permissions.canDeleteNote],
      ] as const) {
        expect(
          screen.getByRole("img", {
            name: `付箋の${label}：${enabled ? "可能" : "不可"}`,
          }),
        ).toBeInTheDocument();
      }
    }
  });
  it("付箋を配置する（success）", () => {
    setup({ notes: buildNotes(3) });

    expect(screen.getAllByTestId("note-card")).toHaveLength(3);
  });

  it("保存済みサイズで2軸マップを描き、広さ変更を伝える", () => {
    const onIdeaMapResize = vi.fn();
    setup({
      phase: buildPhaseStep(2, 3),
      isHost: true,
      ideaMapSizeLevel: 2,
      ideaMapSizeInitialized: true,
      onIdeaMapResize,
    });

    expect(screen.getByTestId("idea-value-feasibility-map")).toHaveStyle({
      width: "1936px",
      height: "1109px",
      bottom: "calc(50% - 450px - 20px)",
      gridTemplateRows: "minmax(0, 1fr) 84px",
    });
    fireEvent.click(screen.getByRole("button", { name: "マップを広くする" }));
    expect(onIdeaMapResize).toHaveBeenCalledWith(3);
  });

  it("付箋が 0 件でも共有付箋の空状態メッセージを表示しない", () => {
    setup({ notes: [] });

    expect(
      screen.queryByText("共有付箋はまだありません"),
    ).not.toBeInTheDocument();
  });

  it("決定ステップで候補が0件なら空状態を示し、ゴーストは同じ場所に残す", () => {
    const phase = buildPhaseStep(5);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isHost: true,
      notes: [buildNote({ id: "note-1", excluded: true, x: 120, y: 240 })],
    });

    expect(
      screen.getByText("候補がありません。候補外の付箋を戻してください。"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("board-note-note-1")).toHaveStyle({
      left: "120px",
      top: "240px",
    });
  });

  it("通常候補を候補外より後に描画し、明示したz-indexで前面に保つ", () => {
    const phase = buildPhaseStep(5);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [
        buildNote({ id: "active", excluded: false, stackOrder: 1 }),
        buildNote({ id: "excluded", excluded: true, stackOrder: 9 }),
      ],
    });

    const cards = screen.getAllByTestId("note-card");
    expect(cards.map((card) => card.dataset.noteId)).toEqual([
      "excluded",
      "active",
    ]);
    expect(cards[0]).toHaveClass("z-0");
    expect(cards[1]).toHaveClass("z-10");
    expect(cards[0].parentElement).toHaveStyle({ zIndex: "0" });
    expect(cards[1].parentElement).toHaveStyle({ zIndex: "1" });
  });

  it("候補外付箋にはキーボードで投票できない", () => {
    const phase = buildPhaseStep(4);
    const onNoteVote = vi.fn();
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      selectedVoteKind: "subjective",
      notes: [buildNote({ id: "excluded", excluded: true })],
      onNoteVote,
    });

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "候補外の付箋",
      }),
      { key: "Enter" },
    );

    expect(onNoteVote).not.toHaveBeenCalled();
  });

  it("ボード背景をクリックすると onSelect(null) で選択を解除する", () => {
    const onSelect = vi.fn();
    setup({ onSelect });

    fireEvent.pointerDown(screen.getByTestId("board-canvas"), {
      pointerId: 1,
    });

    fireEvent.pointerUp(screen.getByTestId("board-canvas"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("近接する付箋からグループ枠を描画する", () => {
    setup({
      phase: buildPhaseStep(3),
      notes: [
        buildNote({ id: "note-1", x: 100, y: 100 }),
        buildNote({ id: "note-2", x: 350, y: 100 }),
      ],
    });

    expect(screen.getByTestId("note-group-card")).toBeInTheDocument();
  });

  it("Step 1-2 では近接する付箋のグループ枠を描画しない", () => {
    setup({
      phase: buildPhaseStep(2),
      notes: [
        buildNote({ id: "note-1", x: 100, y: 100 }),
        buildNote({ id: "note-2", x: 350, y: 100 }),
      ],
      groups: [
        { id: "group-1", name: "既存グループ", noteIds: ["note-1", "note-2"] },
      ],
    });

    expect(screen.queryByTestId("note-group-card")).not.toBeInTheDocument();
  });

  it("Step 1-4 では近接する付箋のグループ枠を描画する", () => {
    setup({
      phase: buildPhaseStep(4),
      notes: [
        buildNote({ id: "note-1", x: 100, y: 100 }),
        buildNote({ id: "note-2", x: 350, y: 100 }),
      ],
    });

    expect(screen.getByTestId("note-group-card")).toBeInTheDocument();
  });

  it.each([
    2, 3, 4, 5,
  ])("フェーズ3 Step3-%i では近接付箋や既存グループを描画しない", (step) => {
    setup({
      phase: buildPhaseStep(step, 3),
      notes: [
        buildNote({ id: "note-1", x: 100, y: 100 }),
        buildNote({ id: "note-2", x: 350, y: 100 }),
      ],
      groups: [
        {
          id: "group-1",
          name: "フェーズ1の残存グループ",
          noteIds: ["note-1", "note-2"],
        },
      ],
    });

    expect(screen.queryByTestId("note-group-card")).not.toBeInTheDocument();
  });

  it("ドラッグ中のゴースト付箋を描画する", () => {
    const ghost = buildNote({ id: "ghost-note", content: "運んでいる付箋" });
    setup({ dragGhost: { note: ghost, x: 120, y: 80 } });

    expect(screen.getByText("運んでいる付箋")).toBeInTheDocument();
  });

  it("マイ付箋へ戻す間はポインターに追従する固定プレビューを描画する", () => {
    const note = buildNote({ id: "returning-note", content: "戻している付箋" });
    setup({
      dragPreview: {
        note,
        left: 640,
        top: 180,
        width: 192,
        height: 144,
      },
    });

    expect(screen.getByTestId("private-note-drag-preview")).toHaveStyle({
      left: "640px",
      top: "180px",
      width: "192px",
      height: "144px",
    });
    expect(screen.getByTestId("private-note-drag-preview").parentElement).toBe(
      document.body,
    );
  });

  it.each(
    NOTE_COLOR_PALETTE,
  )("%s のドラッグゴースト本文は両キャンバスで対応色の前景を使う", (color) => {
    const normalPhase = buildPhaseStep(2);
    const mapPhase = buildPhaseStep(2, 3);
    const ghost = buildNote({
      id: `ghost-${color}`,
      color,
      content: `運んでいる付箋 ${color}`,
    });

    for (const phase of [normalPhase, mapPhase]) {
      const { unmount } = setup({
        phase,
        permissions: getBoardPermissions(phase),
        dragGhost: { note: ghost, x: 120, y: 80 },
      });

      const ghostText = screen.getByText(`運んでいる付箋 ${color}`);
      expect(ghostText.style.color).toBe(
        hexColorToRgb(NOTE_COLOR_STYLES[color].foregroundColor),
      );
      expect(ghostText).not.toHaveClass("dark:text-slate-50");
      unmount();
    }
  });

  it("通常ボードでは永続順序を描画し own・名前付きカーソルの drag と ghost だけを一時最前面にする", () => {
    const notes = [
      { ...buildNote({ id: "back" }), stackOrder: 4 },
      { ...buildNote({ id: "own" }), stackOrder: 8 },
      { ...buildNote({ id: "remote" }), stackOrder: 12 },
    ];
    setup({
      notes,
      draggingNoteId: "own",
      remoteCursors: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 120,
          y: 120,
          draggingNoteId: "remote",
          lastSeenAt: Date.now(),
          isIdle: false,
        },
      ],
      dragGhost: {
        note: { ...notes[0], content: "通常ボードのゴースト" },
        x: 200,
        y: 220,
      },
    });

    const [back, own, remote] = screen.getAllByTestId("note-card");
    expect(back.parentElement).toHaveStyle({ zIndex: "4" });
    expect(own.parentElement).toHaveStyle({ zIndex: "2147483647" });
    expect(remote.parentElement).toHaveStyle({ zIndex: "2147483647" });
    expect(
      screen
        .getByText("通常ボードのゴースト")
        .closest("[data-slot='sticky-note']"),
    ).toHaveStyle({ zIndex: "2147483647" });
  });

  it("通常ボードでは選択状態ではなく確定待ちの付箋だけを一時最前面にする", () => {
    const phase = buildPhaseStep(2);
    const notes = [
      { ...buildNote({ id: "selected", content: "奥の付箋" }), stackOrder: 7 },
      { ...buildNote({ id: "front", content: "手前の付箋" }), stackOrder: 12 },
    ];
    const { props, rerender } = setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes,
      selectedNoteId: "selected",
    });

    const [selected, front] = screen.getAllByTestId("note-card");
    expect(selected.parentElement).toHaveStyle({ zIndex: "7" });
    expect(front.parentElement).toHaveStyle({ zIndex: "12" });

    rerender(
      <RoomBoardCanvas
        {...props}
        notes={notes}
        selectedNoteId="selected"
        draggingNoteId="selected"
      />,
    );

    expect(selected.parentElement).toHaveStyle({ zIndex: "2147483647" });
    expect(front.parentElement).toHaveStyle({ zIndex: "12" });
  });

  it("2軸マップでも選択・名前付きカーソルの drag・ghost を一時最前面にする", () => {
    const phase = buildPhaseStep(3, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [
        { ...buildNote({ id: "map-selected" }), stackOrder: 3 },
        { ...buildNote({ id: "map-remote" }), stackOrder: 9 },
      ],
      selectedNoteId: "map-selected",
      draggingNoteId: "map-selected",
      remoteCursors: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 50,
          y: 50,
          draggingNoteId: "map-remote",
          lastSeenAt: Date.now(),
          isIdle: false,
        },
      ],
      dragGhost: {
        note: {
          ...buildNote({ id: "map-ghost", content: "マップのゴースト" }),
          stackOrder: 1,
        },
        x: 50,
        y: 50,
      },
    });

    expect(
      screen.getByTestId("idea-value-feasibility-map-note-map-selected"),
    ).toHaveStyle({ zIndex: "2147483647" });
    expect(
      screen.getByTestId("idea-value-feasibility-map-note-map-remote"),
    ).toHaveStyle({ zIndex: "2147483647" });
    expect(
      screen.getByText("マップのゴースト").closest("[data-slot='sticky-note']"),
    ).toHaveStyle({ zIndex: "2147483647" });
  });

  it("マイ付箋ツールバーの「付箋を追加」で onAddPrivateNote を呼ぶ", () => {
    const onAddPrivateNote = vi.fn();
    const phase = buildPhaseStep(1);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      onAddPrivateNote,
    });

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(onAddPrivateNote).toHaveBeenCalledTimes(1);
  });

  it("未接続中（error）は付箋の操作が無効化される", () => {
    const phase = buildPhaseStep(1);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      isDisconnected: true,
    });

    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();
  });

  it("発想支援が利用できないステップではサイドバーを表示しない", () => {
    setup({
      phase: buildPhaseStep(1),
    });

    expect(
      screen.queryByRole("button", { name: "発想支援を開く" }),
    ).not.toBeInTheDocument();
  });

  // 補助パネルの表示・開閉は use-board-help / board-help-panel と
  // RoomBoardView の統合テストで検証する。Canvas はボード描画に専念する。
  it("Step3-1では価値×実現のしやすさの2軸マップを表示しない", () => {
    const phase = buildPhaseStep(1, 3);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [],
    });

    expect(
      screen.queryByRole("region", { name: "価値と実現のしやすさの2軸マップ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("board-scroller").parentElement).toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("board-canvas")).not.toBeVisible();
  });

  it.each([
    2, 3, 4, 5,
  ])("Step3-%iでも価値×実現のしやすさの2軸マップを表示する", (step) => {
    const phase = buildPhaseStep(step, 3);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(
      screen.getByRole("region", {
        name: "価値と実現のしやすさの2軸マップ",
      }),
    ).toBeInTheDocument();
  });

  it("2軸マップを無限キャンバスの世界レイヤー内に描画する", () => {
    const phase = buildPhaseStep(2, 3);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
      camera: { x: 30, y: -20, zoom: 2 },
    });

    const boardCanvas = screen.getByTestId("board-canvas");
    const map = screen.getByTestId("idea-value-feasibility-map");

    expect(boardCanvas).toContainElement(map);
    expect(boardCanvas).toHaveStyle({
      transform: "translate3d(30px, -20px, 0) scale(2)",
    });
  });

  it.each([
    0.5, 2,
  ])("倍率%sでグラフ・付箋・ゴーストを同じカメラ倍率で拡縮する", (zoom) => {
    setup({
      phase: buildPhaseStep(3, 3),
      camera: { x: 80, y: -40, zoom },
      notes: [buildNote({ id: "fixed-size", x: 25, y: 75 })],
      dragGhost: {
        note: buildNote({ id: "fixed-ghost", content: "固定サイズゴースト" }),
        x: 75,
        y: 25,
      },
    });
    expect(
      screen.getByTestId("idea-value-feasibility-map-note-fixed-size"),
    ).not.toHaveStyle({ transform: `scale(${1 / zoom})` });
    expect(
      screen
        .getByText("固定サイズゴースト")
        .closest("[data-slot='sticky-note']"),
    ).not.toHaveStyle({ transform: `scale(${1 / zoom})` });
    expect(screen.getByTestId("board-canvas")).toHaveStyle({
      transform: `translate3d(80px, -40px, 0) scale(${zoom})`,
    });
  });

  it("マップ・軸・付箋は同じカメラ変換内に配置する", () => {
    setup({ phase: buildPhaseStep(3, 3), camera: { x: 80, y: -40, zoom: 2 } });
    const world = screen.getByTestId("board-canvas");
    expect(world).toContainElement(
      screen.getByTestId("idea-value-feasibility-map"),
    );
    expect(world).toHaveStyle({
      transform: "translate3d(80px, -40px, 0) scale(2)",
    });
  });

  it.each([
    { id: "bottom-left", x: 0, y: 0 },
    { id: "bottom-right", x: 100, y: 0 },
    { id: "top-left", x: 0, y: 100 },
    { id: "top-right", x: 100, y: 100 },
  ])("2軸マップの四隅（$id）でも共有付箋を平面内に完全表示し、操作できる", ({
    id,
    x,
    y,
  }) => {
    const phase = buildPhaseStep(2, 3);
    const onNoteDragStart = vi.fn();
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [buildNote({ id, x, y })],
      onNoteDragStart,
    });

    const mappedNote = screen.getByTestId(
      `idea-value-feasibility-map-note-${id}`,
    );
    expect(mappedNote).toHaveStyle({
      // clampの複合式はjsdomで未対応。範囲補正の式は純関数のspecで検証する。
      transform: "none",
    });

    const surface = within(mappedNote).getByRole("button", { name: "付箋" });
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
    expect(onNoteDragStart).toHaveBeenCalledWith(id, expect.anything(), {
      clientX: 200,
      clientY: 200,
    });
  });

  it("2軸マップの端でもドラッグゴーストを平面内に完全表示する", () => {
    const phase = buildPhaseStep(2, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      dragGhost: {
        note: buildNote({ id: "map-ghost", content: "移動中のアイデア" }),
        x: 0,
        y: 100,
      },
    });

    const ghost = screen
      .getByText("移動中のアイデア")
      .closest<HTMLElement>("[data-slot='sticky-note']");
    if (!ghost) throw new Error("ドラッグゴーストがありません");

    expect(ghost).toHaveStyle({
      transform: "none",
    });
  });

  it("アイデアフェーズ以外では2軸マップを表示しない", () => {
    const phase = buildPhaseStep(2, 2);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(
      screen.queryByRole("region", { name: "価値と実現のしやすさの2軸マップ" }),
    ).not.toBeInTheDocument();
  });

  it("Step1-1では個人付箋を削除できる", () => {
    const onPrivateNoteDelete = vi.fn();

    setup({
      phase: buildPhaseStep(1),
      permissions: getBoardPermissions(buildPhaseStep(1)),
      privateNotes: [buildNote({ id: "note-1", visibility: "private" })],
      onPrivateNoteDelete,
      selectedNoteId: "note-1",
    });

    const toolbar = openPrivateNotesToolbar();
    const surface = within(toolbar).getByRole("button", { name: "付箋" });

    fireEvent.keyDown(surface, { key: "Delete" });

    expect(onPrivateNoteDelete).toHaveBeenCalledWith("note-1");
  });

  it("Step1-2では個人付箋をBackspace/Deleteで削除できない", () => {
    const onPrivateNoteDelete = vi.fn();

    setup({
      phase: buildPhaseStep(2),
      permissions: getBoardPermissions(buildPhaseStep(2)),
      privateNotes: [buildNote({ visibility: "private" })],
      onPrivateNoteDelete,
    });

    const toolbar = openPrivateNotesToolbar();
    const surface = within(toolbar).getByRole("button", { name: "付箋" });

    fireEvent.keyDown(surface, { key: "Backspace" });
    fireEvent.keyDown(surface, { key: "Delete" });

    expect(onPrivateNoteDelete).not.toHaveBeenCalled();
  });

  it("Step2-2ではマイ付箋エリアを表示する", () => {
    const phase = buildPhaseStep(2, 2);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(screen.getByTestId("private-notes-dock")).toBeInTheDocument();
  });

  it.each([
    { label: "Step1-1", phase: buildPhaseStep(1, 1) },
    { label: "Step2-1", phase: buildPhaseStep(1, 2) },
    { label: "Step3-1", phase: buildPhaseStep(1, 3) },
  ])("$labelでは共有キャンバスを隠し、既存付箋の入力グリッドを表示する", ({
    phase,
  }) => {
    const { props, rerender } = setup({
      phase,
      permissions: getBoardPermissions(phase),
      privateNotes: [
        buildNote({
          id: "private-note",
          visibility: "private",
          content: "個人の考え",
        }),
      ],
    });

    const workspace = screen.getByTestId("private-notes-workspace");
    const note = within(workspace).getByTestId("note-card");
    const editor = within(note).getByPlaceholderText("メモを入力...");
    const addButton = within(workspace).getByRole("button", {
      name: "付箋を追加",
    });

    expect(screen.getByTestId("board-scroller").parentElement).toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("board-canvas")).not.toBeVisible();
    expect(screen.getByTestId("board-tools-hud")).not.toBeVisible();
    expect(screen.getByTestId("board-operation-matrix")).not.toBeVisible();
    expect(screen.queryByTestId("private-notes-dock")).not.toBeInTheDocument();
    expect(note).toHaveStyle({ width: "200px", height: "150px" });
    expect(editor).toHaveStyle({ fontSize: "14px", lineHeight: "21px" });
    expect(addButton).toBeEnabled();
    expect(addButton).toHaveStyle({ width: "200px", height: "150px" });

    fireEvent.click(addButton);
    expect(props.onAddPrivateNote).toHaveBeenCalledOnce();

    const sharingPhase = buildPhaseStep(2, phase.phase);
    rerender(
      <RoomBoardCanvas
        {...props}
        phase={sharingPhase}
        permissions={getBoardPermissions(sharingPhase)}
      />,
    );
    expect(screen.getByTestId("board-tools-hud")).toBeVisible();
    expect(screen.getByTestId("board-operation-matrix")).toBeVisible();
  });

  it("Step1-3ではマイ付箋ツールバーを表示しない", () => {
    setup({
      phase: buildPhaseStep(3),
      permissions: getBoardPermissions(buildPhaseStep(3)),
    });

    expect(screen.queryByTestId("private-notes-dock")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("private-notes-workspace"),
    ).not.toBeInTheDocument();
  });
  it("Step1-4では各付箋をシールのドロップ先として表示する", () => {
    setup({
      phase: buildPhaseStep(4),
      permissions: getBoardPermissions(buildPhaseStep(4)),
      selectedVoteKind: "subjective",
    });

    for (const note of screen.getAllByTestId("note-card")) {
      expect(note).toHaveAttribute("data-vote-drop-target", "true");
      expect(
        within(note).getByRole("button", {
          name: "付箋（主観シールを貼る）",
        }),
      ).toBeInTheDocument();
    }
  });

  it("Step2-3では各付箋をシールのドロップ先として表示する", () => {
    const phase = buildPhaseStep(3, 2);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
    });

    for (const note of screen.getAllByTestId("note-card")) {
      expect(note).toHaveAttribute("data-vote-drop-target", "true");
    }
  });
});

it("採用選択中も候補をドラッグでき、ドラッグでは採用しない", () => {
  const phase = buildPhaseStep(5);
  const { props } = setup({
    phase,
    permissions: getBoardPermissions(phase),
    isHost: true,
    isAdoptMode: true,
  });
  const target = screen.getAllByRole("button", { name: /採用する付箋:/ })[0];
  fireEvent.pointerDown(target, {
    pointerId: 1,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerMove(target, {
    pointerId: 1,
    buttons: 1,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.click(target, { detail: 1 });
  expect(props.onNoteDragStart).toHaveBeenCalled();
  expect(props.onAdoptNote).not.toHaveBeenCalled();
});

it.each([
  "secondary",
  "released",
  "cancelled",
])("採用overlayの%s pointerはhover移動からドラッグを開始しない", (kind) => {
  const phase = buildPhaseStep(5);
  const { props } = setup({
    phase,
    permissions: getBoardPermissions(phase),
    isHost: true,
    isAdoptMode: true,
  });
  const target = screen.getAllByRole("button", { name: /採用する付箋:/ })[0];
  fireEvent.pointerDown(target, {
    pointerId: 1,
    button: kind === "secondary" ? 2 : 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  if (kind === "cancelled") fireEvent.pointerCancel(target, { pointerId: 1 });
  else fireEvent.pointerUp(target, { pointerId: 1 });
  fireEvent.pointerMove(target, {
    pointerId: 1,
    buttons: 0,
    clientX: 100,
    clientY: 100,
  });
  expect(props.onNoteDragStart).not.toHaveBeenCalled();
});

it("極端長文mapカードを平面より小さく表示し、短い付箋も操作できる", () => {
  const phase = buildPhaseStep(2, 3);
  const onNoteDragStart = vi.fn();
  setup({
    phase,
    permissions: getBoardPermissions(phase),
    notes: [
      buildNote({ id: "long", content: "長文\n".repeat(1000) }),
      buildNote({ id: "short" }),
    ],
    onNoteDragStart,
  });
  const card = within(
    screen.getByTestId("idea-value-feasibility-map-note-long"),
  ).getByTestId("note-card");
  expect(Number.parseFloat(card.style.height)).toBeLessThan(822);
  const surface = within(
    screen.getByTestId("idea-value-feasibility-map-note-short"),
  ).getByRole("button", { name: "付箋" });
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 200, clientY: 200 });
  fireEvent.pointerMove(surface, {
    buttons: 1,
    pointerId: 1,
    clientX: 210,
    clientY: 210,
  });
  expect(onNoteDragStart).toHaveBeenCalledWith("short", expect.anything(), {
    clientX: 200,
    clientY: 200,
  });
});

it("現在の作者名を共有付箋とマイ付箋へ渡し、呼び名更新だけで表示を変える", () => {
  const note = buildNote({
    id: "author-note",
    authorId: "writer",
    content: "本文は変えない",
  });
  const { props, rerender } = setup({
    notes: [note],
    privateNotes: [{ ...note, id: "private-author", visibility: "private" }],
    authorName: () => "元の呼び名",
  });
  expect(screen.getAllByTitle("作者: 元の呼び名")).toHaveLength(2);
  rerender(<RoomBoardCanvas {...props} authorName={() => "現在の呼び名"} />);
  expect(screen.getAllByTitle("作者: 現在の呼び名")).toHaveLength(2);
  expect(screen.getAllByText(note.content).length).toBeGreaterThan(0);
});
