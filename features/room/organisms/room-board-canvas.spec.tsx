import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildDecision,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
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
    dragGhost: null,
    isReturnDropTarget: false,
    hmwDecidedIssue: null,
    decidedHmw: null,
    boardScrollerRef: createRef<HTMLDivElement>(),
    ideaMapPlaneRef: createRef<HTMLDivElement>(),
    privateToolbarRef: createRef<HTMLDivElement>(),
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: {},
    isPanning: false,
    onCanvasPointerDown: vi.fn(),
    onCanvasPointerMove: vi.fn(),
    onCanvasPointerEnd: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onFitToNotes: vi.fn(),
    onSelect: vi.fn(),
    onHmwTemplateSelect: vi.fn(),
    onIdeaHintSelect: vi.fn(),
    onNoteDragStart: vi.fn(),
    onNoteContentChange: vi.fn(),
    onNoteDelete: vi.fn(),
    onNoteVote: vi.fn(),
    onNoteVoteReset: vi.fn(),
    onNoteDecide: vi.fn(),
    onGroupCreate: vi.fn(),
    onGroupUpdateName: vi.fn(),
    onAddPrivateNote: vi.fn(),
    onPrivateNoteContentChange: vi.fn(),
    onPrivateNoteDelete: vi.fn(),
    onPrivateNoteDragStart: vi.fn(),
    ...overrides,
  };
  render(<RoomBoardCanvas {...props} />);
  return props;
}

describe("RoomBoardCanvas", () => {
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
    expect(mappedNote).toHaveStyle({ left: `${x}%`, bottom: `${y}%` });
    expect(mappedNote).toHaveStyle({
      transform: `translate(${x === 0 ? 0 : -100}%, ${y === 0 ? 0 : 100}%)`,
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
      left: "0%",
      bottom: "100%",
      transform: "translate(0%, 100%)",
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
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

    const toolbar = screen.getByTestId("private-notes-toolbar");
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

  describe("HMW オーバーレイ", () => {
    it("hmwDecidedIssue があるとボード上に決定課題バナーを表示する", () => {
      setup({ hmwDecidedIssue: "宿題を後回しにしてしまう" });

      expect(
        screen.getByTestId("hmw-decided-issue-banner"),
      ).toBeInTheDocument();
    });

    it("hmwDecidedIssue が null のときは決定課題バナーを表示しない", () => {
      setup({ hmwDecidedIssue: null });

      expect(
        screen.queryByTestId("hmw-decided-issue-banner"),
      ).not.toBeInTheDocument();
    });

    it("Step 2-1 では HMW テンプレートパネルを表示する", () => {
      setup({ phase: buildPhaseStep(1, 2), notes: [] });

      expect(
        screen.getByTestId("hmw-template-panel").parentElement,
      ).toHaveClass("top-16");
    });

    it("フェーズ1のステップでは HMW テンプレートパネルを表示しない", () => {
      setup({ phase: buildPhaseStep(1) });

      expect(
        screen.queryByTestId("hmw-template-panel"),
      ).not.toBeInTheDocument();
    });
  });

  describe("アイデアガイド", () => {
    it("Step 3-1 ではアイデアガイドを表示する", () => {
      setup({ phase: buildPhaseStep(1, 3) });

      expect(screen.getByTestId("idea-guide-panel")).toBeInTheDocument();
    });

    it("Step 3-2 ではアイデアガイドを表示しない", () => {
      setup({ phase: buildPhaseStep(2, 3) });

      expect(screen.queryByTestId("idea-guide-panel")).not.toBeInTheDocument();
    });
  });

  describe("決定操作", () => {
    it("ホストが結果ステップで選択した未決定の付箋右上に決定操作を表示し、押下を通知する", () => {
      const onNoteDecide = vi.fn();
      setup({
        notes: [buildNote({ id: "note-1", x: 100, y: 80 })],
        phase: buildPhaseStep(5),
        isHost: true,
        selectedNoteId: "note-1",
        onNoteDecide,
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "この付箋を取り組む課題に決定",
        }),
      );
      expect(onNoteDecide).toHaveBeenCalledWith("note-1");
      expect(
        screen.getByRole("button", {
          name: "この付箋を取り組む課題に決定",
        }),
      ).toHaveStyle({ left: "260px", top: "84px" });
    });

    it.each([
      {
        phase: buildPhaseStep(5),
        isHost: false,
        isDisconnected: false,
        selectedNoteId: "note-1",
      },
      {
        phase: buildPhaseStep(4),
        isHost: true,
        isDisconnected: false,
        selectedNoteId: "note-1",
      },
      {
        phase: buildPhaseStep(5),
        isHost: true,
        isDisconnected: true,
        selectedNoteId: "note-1",
      },
      {
        phase: buildPhaseStep(5),
        isHost: true,
        isDisconnected: false,
        selectedNoteId: null,
      },
    ])("非ホスト・結果ステップ以外・切断中・未選択では決定操作を表示しない", ({
      phase,
      isHost,
      isDisconnected,
      selectedNoteId,
    }) => {
      setup({ phase, isHost, isDisconnected, selectedNoteId });

      expect(
        screen.queryByRole("button", {
          name: "この付箋を取り組む課題に決定",
        }),
      ).not.toBeInTheDocument();
    });

    it("現在の決定と一致する付箋はstatus表示だけにし、決定操作を重ねない", () => {
      setup({
        phase: buildPhaseStep(5),
        isHost: true,
        selectedNoteId: "note-1",
        decision: buildDecision({
          noteId: "note-1",
          decidedBy: "11111111-1111-4111-8111-111111111111",
        }),
      });

      expect(
        screen.getByRole("status", { name: "取り組む課題に決定済み" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "この付箋を取り組む課題に決定",
        }),
      ).not.toBeInTheDocument();
    });
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
  it("Step1-4では投票可能状態になる", () => {
    setup({
      phase: buildPhaseStep(4),
      permissions: getBoardPermissions(buildPhaseStep(4)),
    });

    expect(
      screen.getAllByRole("button", { name: /投票/ }).length,
    ).toBeGreaterThan(0);
  });

  it("Step2-3では投票可能状態になる", () => {
    const phase = buildPhaseStep(3, 2);

    setup({ phase, permissions: getBoardPermissions(phase) });

    expect(
      screen.getAllByRole("button", { name: /投票/ }).length,
    ).toBeGreaterThan(0);
  });
});
