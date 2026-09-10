import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("付箋の作者色を保ったまま、移動者色の枠と名前付き表示を重ねる", () => {
    setup({
      note: buildNote({ color: "yellow" }),
      activeDragMember: {
        userId: "22222222-2222-4222-8222-222222222222",
        name: "Taro",
        color: "green",
      },
    });

    expect(getCard()).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES.yellow.backgroundColor,
    });
    expect(screen.getByRole("status", { name: "Taro が移動中" })).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES.green.backgroundColor,
    });
    expect(screen.getByTestId("active-note-drag-outline")).toHaveStyle({
      borderColor: NOTE_COLOR_STYLES.green.backgroundColor,
    });
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

    it("結果では両方の合計票を表示する", () => {
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
      expect(screen.getByText("×3")).toBeVisible();
      expect(screen.getByText("×5")).toBeVisible();
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
      expect(getCard()).toHaveClass("ring-2");
      expect(
        screen.getByRole("status", { name: "取り組む課題に決定済み" }),
      ).toHaveClass("bottom-1", "right-1");
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
