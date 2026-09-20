import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildNote, buildNotes } from "@/contracts/room-protocol.fixture";
import { getBoardPermissions } from "../logic/board-permissions";
import { RoomBoardCanvas } from "./room-board-canvas";

function setup(overrides: Partial<Parameters<typeof RoomBoardCanvas>[0]> = {}) {
  const props = {
    notes: buildNotes(2),
    groups: [],
    phase: buildPhaseStep(1),
    decision: null,
    isHost: false,
    permissions: getBoardPermissions(buildPhaseStep(1)),
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
  const { rerender } = render(<RoomBoardCanvas {...props} />);
  return { props, rerender };
}

function openPrivateNotesToolbar() {
  const toolbar = screen.getByTestId("private-notes-toolbar");
  const openButton = within(toolbar).queryByRole("button", {
    name: "マイ付箋を開く",
  });
  if (openButton) fireEvent.click(openButton);
  return toolbar;
}

describe("RoomBoardCanvas", () => {
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
    const phase = buildPhaseStep(1);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
    });

    expect(screen.getByTestId("board-operation-matrix")).toBeInTheDocument();
  });

  it("ステップ変更後も操作可否表示が最新の権限に追従する", () => {
    const firstStep = buildPhaseStep(1);
    const secondStep = buildPhaseStep(2);
    const { props, rerender } = setup({
      phase: firstStep,
      permissions: getBoardPermissions(firstStep),
    });

    expect(
      screen.getByRole("img", { name: "付箋の編集：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の移動：不可" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の削除：可能" }),
    ).toBeInTheDocument();

    rerender(
      <RoomBoardCanvas
        {...props}
        phase={secondStep}
        permissions={getBoardPermissions(secondStep)}
      />,
    );

    expect(
      screen.getByRole("img", { name: "付箋の編集：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の移動：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の削除：不可" }),
    ).toBeInTheDocument();
  });
  it("付箋を配置する（success）", () => {
    setup({ notes: buildNotes(3) });

    expect(screen.getAllByTestId("note-card")).toHaveLength(3);
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
    expect(screen.getByTestId("note-card")).toHaveStyle({
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
    expect(cards[0]).toHaveStyle({ zIndex: "0" });
    expect(cards[1]).toHaveStyle({ zIndex: "1" });
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

  it("ボード背景を直接押すと onSelect(null) で選択を解除する", () => {
    const onSelect = vi.fn();
    setup({ onSelect });

    fireEvent.pointerDown(screen.getByTestId("board-canvas"), {
      pointerId: 1,
    });

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
    expect(back).toHaveStyle({ zIndex: "4" });
    expect(own).toHaveStyle({ zIndex: "2147483647" });
    expect(remote).toHaveStyle({ zIndex: "2147483647" });
    expect(
      screen
        .getByText("通常ボードのゴースト")
        .closest("[data-slot='sticky-note']"),
    ).toHaveStyle({ zIndex: "2147483647" });
  });

  it("選択状態だけでは永続 z-index を変えない", () => {
    setup({
      notes: [{ ...buildNote({ id: "selected" }), stackOrder: 7 }],
      selectedNoteId: "selected",
    });

    expect(screen.getByTestId("note-card")).toHaveStyle({ zIndex: "7" });
  });

  it("2軸マップでも永続順序を使い名前付きカーソルの drag と ghost を一時最前面にする", () => {
    const phase = buildPhaseStep(3, 3);
    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [
        { ...buildNote({ id: "map-back" }), stackOrder: 3 },
        { ...buildNote({ id: "map-remote" }), stackOrder: 9 },
      ],
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
      screen.getByTestId("idea-value-feasibility-map-note-map-back"),
    ).toHaveStyle({ zIndex: "3" });
    expect(
      screen.getByTestId("idea-value-feasibility-map-note-map-remote"),
    ).toHaveStyle({ zIndex: "2147483647" });
    expect(
      screen.getByText("マップのゴースト").closest("[data-slot='sticky-note']"),
    ).toHaveStyle({ zIndex: "2147483647" });
  });

  it("マイ付箋ツールバーの「付箋を追加」で onAddPrivateNote を呼ぶ", () => {
    const onAddPrivateNote = vi.fn();
    setup({ onAddPrivateNote });

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(onAddPrivateNote).toHaveBeenCalledTimes(1);
  });

  it("未接続中（error）は付箋の操作が無効化される", () => {
    setup({ isDisconnected: true });

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
  it("Step3-1では価値×実現可能性の2軸マップを表示しない", () => {
    const phase = buildPhaseStep(1, 3);

    setup({
      phase,
      permissions: getBoardPermissions(phase),
      notes: [],
    });

    expect(
      screen.queryByRole("region", { name: "価値と実現可能性の2軸マップ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("board-scroller")).toHaveClass(
      "[container-type:size]",
    );
    expect(screen.getByTestId("board-canvas")).not.toHaveClass(
      "[container-type:size]",
    );
  });

  it.each([
    2, 3, 4, 5,
  ])("Step3-%iでも価値×実現可能性の2軸マップを表示する", (step) => {
    const phase = buildPhaseStep(step, 3);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(
      screen.getByRole("region", {
        name: "価値と実現可能性の2軸マップ",
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
      pointerId: 1,
      clientX: 210,
      clientY: 210,
    });
    expect(onNoteDragStart).toHaveBeenCalledWith(id, expect.anything());
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
      screen.queryByRole("region", { name: "価値と実現可能性の2軸マップ" }),
    ).not.toBeInTheDocument();
  });

  it("Step1-1では個人付箋を削除できる", () => {
    const onPrivateNoteDelete = vi.fn();

    setup({
      phase: buildPhaseStep(1),
      permissions: getBoardPermissions(buildPhaseStep(1)),
      privateNotes: [buildNote({ id: "note-1", visibility: "private" })],
      onPrivateNoteDelete,
    });

    const toolbar = openPrivateNotesToolbar();
    const surface = within(toolbar).getByRole("button", { name: "付箋" });

    fireEvent.keyDown(surface, { key: "Backspace" });

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

  it("Step1-1ではマイ付箋ツールバーを表示する", () => {
    setup({
      phase: buildPhaseStep(1),
      permissions: getBoardPermissions(buildPhaseStep(1)),
    });

    expect(screen.getByTestId("private-notes-dock")).toBeInTheDocument();
  });

  it("Step3-1ではマイ付箋ツールバーを表示する", () => {
    const phase = buildPhaseStep(1, 3);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(screen.getByTestId("private-notes-dock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeEnabled();
  });

  it("Step1-3ではマイ付箋ツールバーを表示しない", () => {
    setup({
      phase: buildPhaseStep(3),
      permissions: getBoardPermissions(buildPhaseStep(3)),
    });

    expect(screen.queryByTestId("private-notes-dock")).not.toBeInTheDocument();
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
