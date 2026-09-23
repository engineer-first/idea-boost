import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getNoteHeight } from "@/contracts/board";
import type { NoteColor } from "@/contracts/room-protocol";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { NoteCard } from "./note-card";

function setup(overrides: Partial<Parameters<typeof NoteCard>[0]> = {}) {
  const props = {
    note: buildNote(),
    isOwnDrag: false,
    isSelected: false,
    canEditNote: true,
    canDeleteNote: true,
    canMoveNote: true,
    onSelect: vi.fn(),
    onDragStart: vi.fn(),
    onContentChange: vi.fn(),
    onDelete: vi.fn(),
    vote: {
      displayMode: "hidden" as const,
      selectedKind: null,
      voteRemaining: { subjective: 1, objective: 3 },
      canVote: true,
      pendingOperations: [],
      onVote: vi.fn(),
      onVoteRemove: vi.fn(),
    },
    ...overrides,
  };

  const view = render(<NoteCard {...props} />);

  return { props, view };
}

function getCard() {
  return screen.getByTestId("note-card");
}

// 選択・ドラッグ・キー操作を受けるサーフェス（カードに重ねた透明なbutton）。
function getNoteSurface() {
  return screen.getByRole("button", { name: /付箋/ });
}

// pointerdown → pointerup を同じ座標で行う「移動なしのクリック」。
function clickNote(clientX = 10, clientY = 10) {
  const surface = getNoteSurface();
  fireEvent.pointerDown(surface, { pointerId: 1, clientX, clientY });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX, clientY });
}

describe("NoteCard", () => {
  it("付箋ごとの文字サイズを本文だけに適用し、長文は全文ぶん縦へ伸ばす", () => {
    const content = "長い本文".repeat(120);
    const fontSize = 24;
    setup({ note: buildNote({ content, fontSize }) });

    const textbox = screen.getByRole("textbox");
    expect(textbox.style.fontSize).toBe("24px");
    expect(textbox.style.lineHeight).toBe("36px");
    expect(textbox).toHaveClass("overflow-y-hidden");
    expect(getCard()).toHaveStyle({
      width: "200px",
      height: `${getNoteHeight(content, fontSize)}px`,
    });
  });

  it("編集中の本文でもサーバー確定前に付箋を必要高まで伸ばす", () => {
    setup({ isSelected: true, note: buildNote({ content: "短文" }) });
    clickNote();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "あ".repeat(500) },
    });

    expect(getCard()).toHaveStyle({
      height: `${getNoteHeight("あ".repeat(500), 14)}px`,
    });
  });

  it("共有採用フォーカスを StickyNote の視覚状態へ渡す", () => {
    setup({ isAdoptionFocused: true });

    expect(getCard()).toHaveAttribute("data-adoption-focused", "true");
    expect(getCard()).toHaveClass("outline-dashed", "outline-emerald-500");
  });

  it("候補外付箋を同じ座標のゴーストとして表示し、本文を読める", () => {
    setup({
      note: buildNote({
        content: "残して読む本文",
        excluded: true,
        x: 320,
        y: 180,
      } as never),
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,
      canExcludeNote: false,
      canRestoreNote: false,
    } as never);

    expect(getCard()).toHaveAttribute("data-excluded", "true");
    expect(getCard()).toHaveStyle({ left: "320px", top: "180px" });
    expect(screen.getByDisplayValue("残して読む本文")).toBeInTheDocument();
    expect(screen.queryByText("候補外")).not.toBeInTheDocument();
    expect(getCard()).toHaveStyle({ boxShadow: "none" });
    expect(getCard()).toHaveStyle({ borderWidth: "1px" });
    expect(screen.getByRole("textbox")).not.toHaveClass("pt-12");
  });

  it("候補操作を付箋外の最前面レイヤーへ短い表示で出し、付箋色の継ぎ目で対象を示す", () => {
    setup({
      note: buildNote({ color: "blue" }),
      canExcludeNote: true,
    } as never);

    const action = screen.getByRole("button", { name: "候補から外す" });

    expect(getCard()).not.toContainElement(action);
    expect(action).toHaveTextContent("除外");
    expect(action).not.toHaveTextContent("候補から外す");
    expect(action.querySelector(".lucide-list-minus")).toBeInTheDocument();
    expect(action).toHaveClass("fixed", "z-40");
    expect(action).toHaveStyle({ width: "80px", height: "44px" });
    expect(action.querySelector("[data-candidate-action-seam]")).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES.blue.backgroundColor,
    });
    expect(screen.getAllByTestId("candidate-target-corner")).toHaveLength(4);
  });

  it("候補操作を付箋の左下へ隙間なく置き、画面下端では左上へ逃がす", () => {
    setup({ canExcludeNote: true } as never);
    const card = getCard();
    const surface = getNoteSurface();
    const action = screen.getByRole("button", { name: "候補から外す" });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    const rect = vi.spyOn(card, "getBoundingClientRect");
    rect.mockReturnValue({
      bottom: 250,
      height: 150,
      left: 100,
      right: 300,
      top: 100,
      width: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.focus(surface);

    expect(action).toHaveAttribute("data-placement", "bottom");
    expect(action).toHaveClass("rounded-l-md");
    expect(action.style.webkitMaskImage).toContain("right center");
    expect(action.querySelector("[data-candidate-action-seam]")).toHaveClass(
      "left-0",
    );
    expect(action).toHaveStyle({ left: "100px", top: "250px" });

    rect.mockReturnValue({
      bottom: 790,
      height: 150,
      left: 100,
      right: 300,
      top: 640,
      width: 200,
      x: 100,
      y: 640,
      toJSON: () => ({}),
    });
    fireEvent(window, new Event("resize"));

    expect(action).toHaveAttribute("data-placement", "top");
    expect(action).toHaveStyle({ left: "100px", top: "596px" });
  });

  it("付箋から候補操作へポインターを移しても表示を保つ", () => {
    vi.useFakeTimers();
    try {
      setup({ canExcludeNote: true } as never);
      const surface = getNoteSurface();
      const action = screen.getByRole("button", { name: "候補から外す" });

      fireEvent.pointerEnter(surface);
      act(() => vi.advanceTimersByTime(150));
      expect(action).toHaveClass("opacity-100");
      fireEvent.pointerLeave(surface);
      fireEvent.pointerEnter(action);
      act(() => vi.advanceTimersByTime(700));

      expect(action).toHaveClass("opacity-100");
    } finally {
      vi.useRealTimers();
    }
  });

  it("候補操作へ向かう途中で横切った付箋へ操作対象を切り替えない", () => {
    vi.useFakeTimers();
    try {
      setup({
        note: buildNote({ id: "target-note" }),
        canExcludeNote: true,
      } as never);
      setup({
        note: buildNote({ id: "front-note" }),
        canExcludeNote: true,
      } as never);
      const [targetSurface, frontSurface] = screen.getAllByRole("button", {
        name: "付箋",
      });
      const targetAction = document.querySelector<HTMLElement>(
        '[data-candidate-action-note-id="target-note"]',
      );
      const frontAction = document.querySelector<HTMLElement>(
        '[data-candidate-action-note-id="front-note"]',
      );
      if (!targetAction || !frontAction) {
        throw new Error("候補操作がありません");
      }

      fireEvent.pointerEnter(targetSurface);
      act(() => vi.advanceTimersByTime(150));
      fireEvent.pointerLeave(targetSurface);
      fireEvent.pointerEnter(frontSurface);
      act(() => vi.advanceTimersByTime(800));

      expect(targetAction).toHaveClass("opacity-100");
      expect(frontAction).toHaveClass("opacity-0");

      fireEvent.pointerLeave(frontSurface);
      fireEvent.pointerEnter(targetAction);
      act(() => vi.advanceTimersByTime(700));

      expect(targetAction).toHaveClass("opacity-100");
      expect(frontAction).toHaveClass("opacity-0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("タッチ端末では付箋をタップした後だけ候補操作と対象表示を出す", () => {
    setup({ canExcludeNote: true } as never);
    const surface = getNoteSurface();
    const action = screen.getByRole("button", { name: "候補から外す" });
    const targetCorners = screen.getAllByTestId("candidate-target-corner");

    expect(action).toHaveClass("opacity-0");
    expect(action.className).not.toContain("[@media(hover:none)]");
    expect(targetCorners[0]?.parentElement).toHaveClass("opacity-0");

    fireEvent.pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerUp(surface, {
      pointerId: 11,
      pointerType: "touch",
    });

    expect(action).toHaveClass("opacity-100");
    expect(targetCorners[0]?.parentElement).toHaveClass("opacity-100");
  });

  it("別の付箋をタップしたら前の候補操作を閉じる", () => {
    setup({
      note: buildNote({ id: "first-note" }),
      canExcludeNote: true,
    } as never);
    setup({
      note: buildNote({ id: "second-note" }),
      canExcludeNote: true,
    } as never);
    const [firstSurface, secondSurface] = screen.getAllByRole("button", {
      name: "付箋",
    });
    const firstAction = document.querySelector<HTMLElement>(
      '[data-candidate-action-note-id="first-note"]',
    );
    const secondAction = document.querySelector<HTMLElement>(
      '[data-candidate-action-note-id="second-note"]',
    );
    if (!firstSurface || !secondSurface || !firstAction || !secondAction) {
      throw new Error("候補操作がありません");
    }

    fireEvent.pointerDown(firstSurface, {
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerUp(firstSurface, {
      pointerId: 11,
      pointerType: "touch",
    });
    expect(firstAction).toHaveClass("opacity-100");

    fireEvent.pointerDown(secondSurface, {
      pointerId: 12,
      pointerType: "touch",
    });
    fireEvent.pointerUp(secondSurface, {
      pointerId: 12,
      pointerType: "touch",
    });

    expect(firstAction).toHaveClass("opacity-0");
    expect(secondAction).toHaveClass("opacity-100");
  });

  it("タッチドラッグの完了後には候補操作を表示しない", () => {
    setup({ canExcludeNote: true, canMoveNote: true } as never);
    const surface = getNoteSurface();
    const action = screen.getByRole("button", { name: "候補から外す" });

    fireEvent.pointerDown(surface, {
      clientX: 10,
      clientY: 10,
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerMove(surface, {
      clientX: 30,
      clientY: 30,
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerUp(surface, {
      clientX: 30,
      clientY: 30,
      pointerId: 11,
      pointerType: "touch",
    });

    expect(action).toHaveClass("opacity-0");
  });

  it("Tabで付箋から候補操作へ移り、その次は本来の次要素へ進む", () => {
    setup({
      note: buildNote({ id: "target-note" }),
      canExcludeNote: true,
    } as never);
    setup({
      note: buildNote({ id: "next-note" }),
      canExcludeNote: true,
    } as never);
    const [targetSurface, nextSurface] = screen.getAllByRole("button", {
      name: "付箋",
    });
    const targetAction = document.querySelector<HTMLButtonElement>(
      '[data-candidate-action-note-id="target-note"]',
    );
    if (!targetAction) throw new Error("候補操作がありません");

    targetSurface?.focus();
    fireEvent.keyDown(targetSurface, { key: "Tab" });
    expect(targetAction).toHaveFocus();

    fireEvent.keyDown(targetAction, { key: "Tab" });
    expect(nextSurface).toHaveFocus();

    targetAction.focus();
    fireEvent.keyDown(targetAction, { key: "Tab", shiftKey: true });
    expect(targetSurface).toHaveFocus();
  });

  it("候補操作の先に要素がない場合はTabの既定動作を妨げない", () => {
    setup({ canExcludeNote: true } as never);
    const surface = getNoteSurface();
    const action = screen.getByRole("button", { name: "候補から外す" });

    surface.focus();
    fireEvent.keyDown(surface, { key: "Tab" });

    expect(action).toHaveFocus();
    expect(fireEvent.keyDown(action, { key: "Tab" })).toBe(true);
  });

  it("右クリックは即実行せず、操作名付きメニューから候補外と復帰を実行できる", () => {
    const onExclude = vi.fn();
    const onRestore = vi.fn();
    const { view } = setup({
      canExcludeNote: true,
      canRestoreNote: true,
      onExclude,
      onRestore,
    } as never);

    fireEvent.contextMenu(getNoteSurface());
    expect(onExclude).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "候補から外す" }));
    expect(onExclude).toHaveBeenCalledWith("note-1");

    view.unmount();

    setup({
      note: buildNote({ excluded: true } as never),
      canExcludeNote: true,
      canRestoreNote: true,
      onExclude,
      onRestore,
    } as never);
    fireEvent.contextMenu(getNoteSurface());
    expect(onRestore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "候補に戻す" }));
    expect(onRestore).toHaveBeenCalledWith("note-1");
  });

  it("候補操作メニューを開いた後に切断されたら操作を送らない", () => {
    const onExclude = vi.fn();
    const { props, view } = setup({ canExcludeNote: true, onExclude } as never);

    fireEvent.contextMenu(getNoteSurface());
    const menuItem = screen.getByRole("menuitem", { name: "候補から外す" });
    view.rerender(<NoteCard {...props} disabled />);
    fireEvent.click(menuItem);

    expect(onExclude).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("menuitem", { name: "候補から外す" }),
    ).not.toBeInTheDocument();
  });

  it("Shift+F10 は復帰を即実行せず、メニュー項目へフォーカスする", () => {
    const onRestore = vi.fn();
    setup({
      note: buildNote({ excluded: true } as never),
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,
      canRestoreNote: true,
      onRestore,
    } as never);

    fireEvent.keyDown(getNoteSurface(), { key: "F10", shiftKey: true });

    const item = screen.getByRole("menuitem", { name: "候補に戻す" });
    expect(item).toHaveFocus();
    expect(onRestore).not.toHaveBeenCalled();
    fireEvent.click(item);
    expect(onRestore).toHaveBeenCalledWith("note-1");
  });

  it("通常候補は付箋近傍の明示操作から候補外にできる", () => {
    const onExclude = vi.fn();
    setup({ canExcludeNote: true, onExclude } as never);

    fireEvent.click(screen.getByRole("button", { name: "候補から外す" }));

    expect(onExclude).toHaveBeenCalledWith("note-1");
  });

  it("タップすると候補外付箋の復帰操作を表示する", () => {
    setup({
      note: buildNote({ excluded: true } as never),
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,
      canRestoreNote: true,
    } as never);
    const restore = screen.getByRole("button", { name: "候補に戻す" });

    fireEvent.pointerDown(getNoteSurface(), {
      pointerId: 7,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(getNoteSurface(), {
      pointerId: 7,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    });

    expect(restore).toHaveClass("opacity-100");
    expect(getCard()).toHaveClass("opacity-90");
    expect(screen.queryByText("候補外")).not.toBeInTheDocument();
  });

  it("非ホストもタップすると候補外付箋の本文を読める濃さに戻せる", () => {
    setup({
      note: buildNote({ excluded: true } as never),
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,
      canExcludeNote: false,
      canRestoreNote: false,
    } as never);

    const surface = getNoteSurface();
    fireEvent.pointerDown(surface, {
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.pointerUp(surface, { pointerId: 8, pointerType: "touch" });

    expect(getCard()).toHaveClass("opacity-90");
    expect(screen.queryByText("候補外")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "候補に戻す" })).toBeNull();
  });

  it("ホバーとフォーカスで候補外付箋の復帰操作を表示する", () => {
    vi.useFakeTimers();
    try {
      setup({
        note: buildNote({ excluded: true } as never),
        canEditNote: false,
        canDeleteNote: false,
        canMoveNote: false,
        canRestoreNote: true,
      } as never);
      const surface = getNoteSurface();
      const restore = screen.getByRole("button", { name: "候補に戻す" });

      fireEvent.pointerEnter(surface);
      act(() => vi.advanceTimersByTime(150));
      expect(restore).toHaveClass("opacity-100");
      fireEvent.pointerLeave(surface);
      expect(restore).toHaveClass("opacity-100");
      act(() => vi.advanceTimersByTime(1_000));
      expect(restore).toHaveClass("opacity-0");
      fireEvent.focus(surface);
      expect(restore).toHaveClass("opacity-100");
    } finally {
      vi.useRealTimers();
    }
  });

  it("非ホストには候補外・復帰操作を表示しない", () => {
    setup({
      note: buildNote({ excluded: true } as never),
      canExcludeNote: false,
      canRestoreNote: false,
    } as never);

    expect(screen.queryByRole("button", { name: "候補に戻す" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "候補に戻す" })).toBeNull();
  });
  it("付箋の本文を表示する", () => {
    setup({ note: buildNote({ content: "こんにちは" }) });

    expect(screen.getByDisplayValue("こんにちは")).toBeInTheDocument();
  });

  it("追加直後の付箋は本文を入力できる状態でフォーカスする", () => {
    setup({
      note: buildNote({ content: "" }),
      isSelected: true,
      autoFocusEditor: true,
    });

    expect(screen.getByRole("textbox")).not.toHaveAttribute("readonly");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it.each<NoteColor>([
    "yellow",
    "green",
    "blue",
    "pink",
    "orange",
    "purple",
  ])("%s の付箋をFigJam風パステルカラーで表示する", (color) => {
    setup({ note: buildNote({ color }) });

    expect(getCard()).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
    });
  });

  it("薄い付箋色の上で本文を常に濃色で表示する", () => {
    setup();

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("text-slate-900");
    expect(textarea.className).not.toContain("dark:text-");
  });

  it("ドラッグ専用の操作者名や色枠を付箋へ重ねない", () => {
    setup({ note: buildNote({ color: "yellow", content: "本文" }) });
    expect(screen.getByRole("textbox")).toHaveValue("本文");
    expect(screen.queryByText(/移動中/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("active-note-drag-outline"),
    ).not.toBeInTheDocument();
  });

  it("本文の入力はコントラクトの上限文字数で制限される", () => {
    // サーバー（RoomDO）は上限超過を invalid-message で黙って拒否するため、
    // UI 側で制限しないと「本人にだけ保存されて見える」分岐が起きる。
    setup();

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "maxlength",
      String(NOTE_CONTENT_MAX_LENGTH),
    );
  });

  describe("ドット投票", () => {
    it("投票中は自分が貼ったシールだけを表示し、他者の集計を見せない", () => {
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 3, votedByMe: false, ownCount: 0 },
            objective: { count: 5, votedByMe: true, ownCount: 2 },
          },
        }),
        vote: {
          displayMode: "voting",
          selectedKind: null,
          voteRemaining: { subjective: 1, objective: 1 },
          canVote: true,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      expect(
        screen.getByRole("button", { name: "客観シール 2票を1票取り消す" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("主観シール 3票")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("客観シール 5票")).not.toBeInTheDocument();
    });

    it("投票中の自分のシールを、付箋上の保存済み相対座標へ重ねて表示する", () => {
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
          dotVoteStickers: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              kind: "objective",
              x: 0.25,
              y: 0.75,
            },
          ],
        }),
        vote: {
          displayMode: "voting",
          selectedKind: null,
          voteRemaining: { subjective: 1, objective: 2 },
          canVote: true,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      const sticker = screen.getByRole("button", {
        name: "客観シール 1票を1票取り消す",
      });
      expect(sticker.parentElement).toHaveStyle({ left: "25%", top: "75%" });
    });

    it("シール選択中でもNoteCard自身のクリックでは投票せず、ボードの配置操作へ委ねる", () => {
      const onVote = vi.fn();
      setup({
        isSelected: true,
        canEditNote: false,
        vote: {
          displayMode: "voting",
          selectedKind: "subjective",
          voteRemaining: { subjective: 1, objective: 3 },
          canVote: true,
          pendingOperations: [],
          onVote,
          onVoteRemove: vi.fn(),
        },
      });

      clickNote();

      expect(onVote).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it.each([
      "Enter",
      " ",
    ])("シール選択中に%sを押すと付箋の中央へ投票する", (key) => {
      const onVote = vi.fn();
      const { props } = setup({
        isSelected: true,
        canEditNote: false,
        vote: {
          displayMode: "voting",
          selectedKind: "subjective",
          voteRemaining: { subjective: 1, objective: 3 },
          canVote: true,
          pendingOperations: [],
          onVote,
          onVoteRemove: vi.fn(),
        },
      });

      fireEvent.keyDown(getNoteSurface(), { key });

      expect(onVote).toHaveBeenCalledWith(props.note.id, "subjective");
      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("付箋のホバーでは投票用プレビューを出さない", () => {
      setup({
        vote: {
          displayMode: "voting",
          selectedKind: "subjective",
          voteRemaining: { subjective: 1, objective: 3 },
          canVote: true,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      fireEvent.pointerEnter(getNoteSurface());

      expect(
        screen.queryByRole("img", { name: "主観シールを貼る位置" }),
      ).not.toBeInTheDocument();
    });

    it("シール選択中にドラッグしようとしても投票しない", () => {
      const onVote = vi.fn();
      setup({
        vote: {
          displayMode: "voting",
          selectedKind: "objective",
          voteRemaining: { subjective: 1, objective: 3 },
          canVote: true,
          pendingOperations: [],
          onVote,
          onVoteRemove: vi.fn(),
        },
      });

      const surface = getNoteSurface();
      fireEvent.pointerDown(surface, {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 10,
      });
      fireEvent.pointerUp(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 10,
      });
      fireEvent.click(surface);

      expect(onVote).not.toHaveBeenCalled();
    });

    it("結果では左下の専用余白に主観→客観の順で全票を表示する", () => {
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 3, votedByMe: false, ownCount: 0 },
            objective: { count: 5, votedByMe: true, ownCount: 2 },
          },
        }),
        vote: {
          displayMode: "result",
          selectedKind: null,
          voteRemaining: { subjective: 0, objective: 0 },
          canVote: false,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      expect(
        screen.getByRole("img", { name: "主観シール 3票" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "客観シール 5票" }),
      ).toBeInTheDocument();
      const results = screen.getByTestId("note-vote-results");
      const groups = screen.getAllByRole("img", { name: /シール \d+票/ });
      expect(results).toHaveClass("h-10", "shrink-0", "pl-2");
      expect(groups[0]).toHaveAccessibleName("主観シール 3票");
      expect(groups[1]).toHaveAccessibleName("客観シール 5票");
      expect(
        screen.getAllByTestId("dot-vote-sticker-image-subjective"),
      ).toHaveLength(3);
      expect(
        screen.getAllByTestId("dot-vote-sticker-image-objective"),
      ).toHaveLength(5);
      expect(screen.getByRole("textbox")).toHaveClass("pb-12");
    });

    it("高得票でも打ち切らず、付箋外の候補操作用には右下余白を広げない", () => {
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 11, votedByMe: false, ownCount: 0 },
            objective: { count: 24, votedByMe: false, ownCount: 0 },
          },
        }),
        canExcludeNote: true,
        vote: {
          displayMode: "result",
          selectedKind: null,
          voteRemaining: { subjective: 0, objective: 0 },
          canVote: false,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      expect(
        screen.getAllByTestId("dot-vote-sticker-image-subjective"),
      ).toHaveLength(11);
      expect(
        screen.getAllByTestId("dot-vote-sticker-image-objective"),
      ).toHaveLength(24);
      expect(screen.getByTestId("note-vote-results")).toHaveClass("pr-2");
      expect(screen.getByRole("button", { name: "候補から外す" })).toHaveStyle({
        width: "80px",
        height: "44px",
      });
    });

    it("決定済み表示と重ならないよう投票結果の右下余白を維持する", () => {
      setup({
        isDecided: true,
        vote: {
          displayMode: "result",
          selectedKind: null,
          voteRemaining: { subjective: 0, objective: 0 },
          canVote: false,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove: vi.fn(),
        },
      });

      expect(screen.getByTestId("note-vote-results")).toHaveClass("pr-12");
    });

    it("自分のシールだけを1票ずつ取り消せる", () => {
      const onVoteRemove = vi.fn();
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 2, votedByMe: true, ownCount: 2 },
          },
        }),
        vote: {
          displayMode: "voting",
          selectedKind: null,
          voteRemaining: { subjective: 1, objective: 1 },
          canVote: true,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove,
        },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "客観シール 2票を1票取り消す" }),
      );

      expect(onVoteRemove).toHaveBeenCalledWith("note-1", "objective");
    });

    it("個別シールのクリックはシールIDだけを削除コールバックへ渡す", () => {
      const onStickerRemove = vi.fn();
      const onVoteRemove = vi.fn();
      const stickerId = "33333333-3333-4333-8333-333333333333";
      setup({
        note: buildNote({
          dotVotes: {
            subjective: { count: 0, votedByMe: false, ownCount: 0 },
            objective: { count: 1, votedByMe: true, ownCount: 1 },
          },
          dotVoteStickers: [
            { id: stickerId, kind: "objective", x: 0.25, y: 0.75 },
          ],
        }),
        vote: {
          displayMode: "voting",
          selectedKind: null,
          voteRemaining: { subjective: 1, objective: 2 },
          canVote: true,
          pendingOperations: [],
          onVote: vi.fn(),
          onVoteRemove,
          onStickerRemove,
        },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "客観シール 1票を1票取り消す" }),
      );

      expect(onStickerRemove).toHaveBeenCalledWith(stickerId);
      expect(onVoteRemove).not.toHaveBeenCalled();
    });
  });

  describe("選択", () => {
    it("付箋ごとに重なり順を閉じ込めるstacking contextを作る", () => {
      setup();

      expect(getCard()).toHaveClass("isolate");
    });

    it("未選択の付箋はpointerdownでonSelectを呼ぶ", () => {
      const onSelect = vi.fn();
      setup({ onSelect });

      fireEvent.pointerDown(getNoteSurface(), {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
      });

      expect(onSelect).toHaveBeenCalledWith("note-1");
    });

    it("選択状態はdata-selected属性で見た目に反映される", () => {
      setup({ isSelected: true });

      expect(getCard()).toHaveAttribute("data-selected", "true");
    });

    it("未選択時はdata-selected属性が付かない", () => {
      setup({ isSelected: false });

      expect(getCard()).not.toHaveAttribute("data-selected");
    });

    it("isDecided=true の付箋を強調し、決定済みのstatusを表示する", () => {
      setup({ isDecided: true });

      expect(getCard()).toHaveAttribute("data-decided", "true");
      expect(getCard()).toHaveClass("outline-4", "outline-emerald-600");
      expect(
        screen.getByRole("status", { name: "取り組む課題に決定済み" }),
      ).toHaveClass(
        "bottom-1",
        "right-1",
        "border-2",
        "border-white",
        "shadow-lg",
      );
    });
  });

  describe("編集モード", () => {
    it("選択済みの付箋をクリックすると編集モードに入りtextareaへフォーカスが移る", () => {
      setup({ isSelected: true });

      clickNote();

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveFocus();
      expect(textarea).not.toHaveAttribute("readonly");
    });

    it("未選択の付箋のクリックでは編集モードに入らない", () => {
      setup({ isSelected: false });

      clickNote();

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("editingDisabled 中は選択済みの付箋をクリックしても編集モードに入らない", () => {
      setup({ isSelected: true, editingDisabled: true });

      clickNote();

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("editingDisabled 中は選択済みの付箋でEnterを押しても編集モードに入らない", () => {
      setup({ isSelected: true, editingDisabled: true });

      fireEvent.keyDown(getNoteSurface(), { key: "Enter" });

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("編集中にeditingDisabledになると編集を強制終了し、onContentChangeを呼ばずに本文を巻き戻す", () => {
      const onContentChange = vi.fn();
      const { props, view } = setup({
        isSelected: true,
        onContentChange,
        note: buildNote({ content: "サーバー上の本文" }),
      });

      clickNote();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "未送信の下書き" },
      });

      view.rerender(<NoteCard {...props} editingDisabled />);

      expect(getCard()).not.toHaveAttribute("data-editing");
      expect(onContentChange).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
      expect(screen.getByDisplayValue("サーバー上の本文")).toBeInTheDocument();
    });

    it("editingDisabled 中に手動でblurしてもonContentChangeを呼ばない", () => {
      const onContentChange = vi.fn();
      setup({ isSelected: true, editingDisabled: true, onContentChange });

      const textarea = screen.getByRole("textbox");
      fireEvent.blur(textarea);

      expect(onContentChange).not.toHaveBeenCalled();
    });

    it("選択中にEnterで編集モードに入る", () => {
      setup({ isSelected: true });

      fireEvent.keyDown(getNoteSurface(), { key: "Enter" });

      expect(screen.getByRole("textbox")).toHaveFocus();
    });

    it("選択中に文字キーを押すと編集を開始し、その文字を本文へ追加する", () => {
      setup({ isSelected: true, note: buildNote({ content: "既存の本文" }) });

      fireEvent.keyDown(getNoteSurface(), { key: "a" });

      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveFocus();
      expect(textarea).not.toHaveAttribute("readonly");
      expect(textarea).toHaveValue("既存の本文a");
    });

    it.each([
      { key: "a", ctrlKey: true },
      { key: "a", metaKey: true },
      { key: "a", altKey: true },
    ])("修飾キー付きの文字入力はショートカットとして保持する", (keyEvent) => {
      setup({ isSelected: true });

      fireEvent.keyDown(getNoteSurface(), keyEvent);

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
      expect(screen.getByDisplayValue("付箋の本文")).toBeInTheDocument();
    });

    it("編集してフォーカスが外れるとonContentChangeを呼び編集モードを終了する", () => {
      const onContentChange = vi.fn();
      setup({ isSelected: true, onContentChange });

      clickNote();
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "更新後の本文" } });
      fireEvent.blur(textarea);

      expect(onContentChange).toHaveBeenCalledWith("note-1", "更新後の本文");
      expect(textarea).toHaveAttribute("readonly");
    });

    it("編集中にEscapeで編集モードを終了しサーフェスへフォーカスを戻す", () => {
      setup({ isSelected: true });

      clickNote();
      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "Escape" });

      expect(textarea).toHaveAttribute("readonly");
      expect(getNoteSurface()).toHaveFocus();
    });

    it("Escapeでの編集終了でも編集内容は保存される（キャンセルではなくコミット）", () => {
      // tldraw の Note shape 踏襲: Escape は「編集の完了」であり、blur と同じく
      // 内容を確定する。誤って Escape を押したときに入力が消えるのを防ぐ意図。
      const onContentChange = vi.fn();
      setup({ isSelected: true, onContentChange });

      clickNote();
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "編集した本文" } });
      fireEvent.keyDown(textarea, { key: "Escape" });

      expect(onContentChange).toHaveBeenCalledWith("note-1", "編集した本文");
    });
  });

  describe("キーボード削除", () => {
    it("選択中（非編集）にBackspaceでonDeleteを呼ぶ", () => {
      const onDelete = vi.fn();
      setup({ isSelected: true, onDelete });

      fireEvent.keyDown(getNoteSurface(), { key: "Backspace" });

      expect(onDelete).toHaveBeenCalledWith("note-1");
    });

    it("選択中（非編集）にDeleteでonDeleteを呼ぶ", () => {
      const onDelete = vi.fn();
      setup({ isSelected: true, onDelete });

      fireEvent.keyDown(getNoteSurface(), { key: "Delete" });

      expect(onDelete).toHaveBeenCalledWith("note-1");
    });

    it("canDeleteNote=falseではBackspace/DeleteでもonDeleteを呼ばない", () => {
      const onDelete = vi.fn();

      setup({
        isSelected: true,
        canDeleteNote: false,
        onDelete,
      });

      fireEvent.keyDown(getNoteSurface(), { key: "Backspace" });
      fireEvent.keyDown(getNoteSurface(), { key: "Delete" });

      expect(onDelete).not.toHaveBeenCalled();
    });

    it("編集中のBackspaceは文字削除でありonDeleteを呼ばない", () => {
      const onDelete = vi.fn();
      setup({ isSelected: true, onDelete });

      clickNote();
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe("ドラッグ", () => {
    it("閾値を超えるポインター移動でonDragStartを呼ぶ", () => {
      const onDragStart = vi.fn();
      setup({
        note: buildNote({ x: 100, y: 100 }),
        onDragStart,
      });

      const surface = getNoteSurface();

      fireEvent.pointerDown(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      });
      expect(onDragStart).not.toHaveBeenCalled();

      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 80,
        clientY: 70,
      });
      expect(onDragStart).toHaveBeenCalledWith("note-1", expect.any(Object));
    });

    it("閾値内の移動はクリック扱いでドラッグイベントを発火しない", () => {
      const onDragStart = vi.fn();
      setup({ onDragStart });

      const surface = getNoteSurface();
      fireEvent.pointerDown(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      });
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 52,
        clientY: 51,
      });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 52, clientY: 51 });

      expect(onDragStart).not.toHaveBeenCalled();
    });

    it("ドラッグ後のpointerupでは選択済みでも編集モードに入らない", () => {
      setup({ isSelected: true });

      const surface = getNoteSurface();
      fireEvent.pointerDown(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      });
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 80,
        clientY: 70,
      });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 80, clientY: 70 });

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("ドラッグ開始前のポインター移動は無視する", () => {
      const onDragStart = vi.fn();
      setup({ onDragStart });

      fireEvent.pointerMove(getNoteSurface(), {
        pointerId: 1,
        clientX: 999,
        clientY: 999,
      });

      expect(onDragStart).not.toHaveBeenCalled();
    });
  });

  describe("無効化（未接続時）", () => {
    // WebSocket が connecting / closed の間は、操作してもサーバーに
    // 届かず（room-client が握りつぶす）画面だけ変化してしまう。
    // それを防ぐため disabled=true の間は選択・ドラッグ・編集開始・削除を
    // すべて無効化する。
    it("disabled中のpointerdownはonSelectを呼ばない", () => {
      const onSelect = vi.fn();
      setup({ disabled: true, onSelect });

      fireEvent.pointerDown(getNoteSurface(), {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
      });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("disabled中はドラッグしてもonDragStartを呼ばない", () => {
      const onDragStart = vi.fn();
      setup({
        disabled: true,
        note: buildNote({ x: 100, y: 100 }),
        onDragStart,
      });

      const surface = getNoteSurface();
      fireEvent.pointerDown(surface, {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
      });
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 80,
        clientY: 70,
      });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 80, clientY: 70 });

      expect(onDragStart).not.toHaveBeenCalled();
    });

    it("disabled中は選択済みでもEnterで編集モードに入らない", () => {
      setup({ disabled: true, isSelected: true });

      fireEvent.keyDown(getNoteSurface(), { key: "Enter" });

      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });

    it("disabled中は選択済みでもBackspace/DeleteでonDeleteを呼ばない", () => {
      const onDelete = vi.fn();
      setup({ disabled: true, isSelected: true, onDelete });

      fireEvent.keyDown(getNoteSurface(), { key: "Backspace" });
      fireEvent.keyDown(getNoteSurface(), { key: "Delete" });

      expect(onDelete).not.toHaveBeenCalled();
    });

    it("編集中に切断されると編集を強制終了し、onContentChangeを呼ばずに本文を巻き戻す", () => {
      const onContentChange = vi.fn();
      const { props, view } = setup({
        isSelected: true,
        onContentChange,
        note: buildNote({ content: "サーバー上の本文" }),
      });

      clickNote();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "未送信の下書き" },
      });

      view.rerender(<NoteCard {...props} disabled />);

      expect(onContentChange).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
      expect(screen.getByDisplayValue("サーバー上の本文")).toBeInTheDocument();
    });

    it("disabled中に手動でblurしてもonContentChangeを呼ばない", () => {
      const onContentChange = vi.fn();
      setup({ isSelected: true, disabled: true, onContentChange });

      const textarea = screen.getByRole("textbox");
      fireEvent.blur(textarea);

      expect(onContentChange).not.toHaveBeenCalled();
    });

    it("付箋のサーフェスにaria-disabledが付く", () => {
      setup({ disabled: true });

      expect(getNoteSurface()).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("他ユーザーの更新の反映", () => {
    it("非編集時はnote.contentの更新を本文へ反映する", () => {
      const { props, view } = setup();

      view.rerender(
        <NoteCard {...props} note={buildNote({ content: "他人の更新" })} />,
      );

      expect(screen.getByDisplayValue("他人の更新")).toBeInTheDocument();
    });

    it("編集中はnote.contentの更新で本文を上書きしない", () => {
      const { props, view } = setup({ isSelected: true });

      clickNote();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "編集中の本文" },
      });

      view.rerender(
        <NoteCard
          {...props}
          isSelected
          note={buildNote({ content: "他人の更新" })}
        />,
      );

      expect(screen.getByDisplayValue("編集中の本文")).toBeInTheDocument();
    });
  });
});
