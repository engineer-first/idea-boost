import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { PrivateNotesToolbar } from "./private-notes-toolbar";

function setup(disabled = false) {
  const props = {
    notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
    disabled,
    selectedNoteId: null,
    canCreateNote: true,
    canDeleteNote: true,
    canMoveNote: true,
    canEditNote: true,
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onContentChange: vi.fn(),
    onDelete: vi.fn(),
    onDragStart: vi.fn(),
    defaultExpanded: true,
  };
  render(<PrivateNotesToolbar {...props} />);
  return props;
}

describe("PrivateNotesToolbar", () => {
  it("初期状態は開いて表示し、必要なときに小さなドックへ閉じる", () => {
    const onAdd = vi.fn();
    render(
      <PrivateNotesToolbar
        notes={[buildNote({ visibility: "private" })]}
        disabled={false}
        selectedNoteId={null}
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        onSelect={vi.fn()}
        onAdd={onAdd}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const toolbar = screen.getByTestId("private-notes-toolbar");
    expect(toolbar).toHaveAttribute("data-expanded", "true");
    expect(toolbar).toHaveClass("w-60", "flex-col");
    expect(toolbar).toHaveClass("h-fit", "max-h-[min(48rem,calc(100vh-6rem))]");
    const controls = screen.getByTestId("private-notes-controls");
    expect(controls).toHaveClass("ml-auto", "w-fit");
    expect(
      screen.getByRole("heading", { name: "マイ付箋" }),
    ).toBeInTheDocument();
    expect(controls).toContainElement(
      screen.getByRole("button", { name: "付箋を追加" }),
    );
    expect(screen.getByRole("button", { name: "付箋を追加" })).toHaveAttribute(
      "data-size",
      "icon-sm",
    );
    expect(screen.queryByText("1件")).not.toBeInTheDocument();
    expect(
      screen.queryByText("自分だけに表示されています"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付箋" })).toBeInTheDocument();

    const closeButton = screen.getByRole("button", {
      name: "マイ付箋を閉じる",
    });
    expect(controls).toContainElement(closeButton);
    fireEvent.click(closeButton);

    expect(toolbar).toHaveAttribute("data-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "付箋" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "マイ付箋を開く" }),
    ).toBeInTheDocument();
    expect(controls).toContainElement(
      screen.getByRole("button", { name: "マイ付箋を開く" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(toolbar).toHaveAttribute("data-expanded", "true");
  });

  it("個人付箋を表示し、追加と削除を操作できる", () => {
    const props = setup();
    expect(screen.getByDisplayValue("非公開の考え")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));

    const surface = screen.getByRole("button", { name: "付箋" });
    fireEvent.keyDown(surface, { key: "Backspace" });

    expect(props.onAdd).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledWith("note-1");
  });

  it("ボード付箋と同じ付箋スタイルで表示し、投票UIは表示しない", () => {
    setup();

    const note = screen.getByTestId("note-card");
    expect(note).toHaveAttribute("data-slot", "sticky-note");
    expect(note).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES.yellow.backgroundColor,
    });
    expect(
      screen.queryByRole("button", { name: "主観ドットを投票" }),
    ).not.toBeInTheDocument();
  });

  it("展開時は右側の縦パネル内へ付箋を1列で表示する", () => {
    const props = {
      notes: [
        buildNote({ id: "note-1", visibility: "private" }),
        buildNote({ id: "note-2", visibility: "private" }),
      ],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      defaultExpanded: true,
    };
    render(<PrivateNotesToolbar {...props} />);

    const toolbar = screen.getByTestId("private-notes-toolbar");
    expect(toolbar).toHaveAttribute("data-expanded", "true");
    expect(within(toolbar).getByTestId("private-notes-scroll")).toHaveClass(
      "overflow-y-auto",
      "min-h-0",
      "flex-1",
    );
    expect(
      within(toolbar).getByTestId("private-notes-scroll").parentElement,
    ).toHaveClass("overflow-hidden");
    expect(within(toolbar).getByTestId("private-notes-list")).toHaveClass(
      "grid",
      "grid-cols-1",
    );
    expect(within(toolbar).getAllByTestId("note-card")[0]).toHaveStyle({
      width: "192px",
      height: "144px",
    });
    expect(
      screen
        .getByRole("button", { name: "付箋を追加" })
        .closest("[data-slot='card-footer']"),
    ).toBeInTheDocument();
  });

  it("新しい付箋を末尾へ表示して滑らかにスクロールし、追加直後から本文を入力できる", () => {
    const oldNote = buildNote({
      id: "old-note",
      visibility: "private",
      content: "前の付箋",
      createdAt: "2026-07-03T00:00:00.000Z",
    });
    const newNote = buildNote({
      id: "new-note",
      visibility: "private",
      content: "",
      createdAt: "2026-07-03T00:01:00.000Z",
    });
    const onAdd = vi.fn();
    const onSelect = vi.fn();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const props = {
      notes: [oldNote],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect,
      onAdd,
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<PrivateNotesToolbar {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "付箋を追加" }));
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[oldNote, newNote]}
        selectedNoteId="new-note"
      />,
    );

    const textboxes = screen.getAllByRole("textbox");
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("new-note");
    expect(
      textboxes.map((textbox) => (textbox as HTMLTextAreaElement).value),
    ).toEqual(["前の付箋", ""]);
    expect(textboxes[1]).not.toHaveAttribute("readonly");
    expect(textboxes[1]).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
    expect(screen.getAllByTestId("note-card")[1]).toHaveClass(
      "animate-in",
      "fade-in",
      "slide-in-from-bottom-2",
    );
  });

  it("本文はフォーカスを外した時に保存する", () => {
    const props = {
      notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
      disabled: false,
      selectedNoteId: "note-1",
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      defaultExpanded: true,
    };
    render(<PrivateNotesToolbar {...props} />);

    const surface = screen.getByRole("button", { name: "付箋" });
    fireEvent.click(surface);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "書き換えた内容" } });
    fireEvent.blur(textarea);

    expect(props.onContentChange).toHaveBeenCalledWith(
      "note-1",
      "書き換えた内容",
    );
  });

  it("切断中は追加・編集・削除を無効化する", () => {
    const props = {
      notes: [buildNote({ visibility: "private", content: "非公開 of考え" })],
      disabled: true,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      defaultExpanded: true,
    };
    render(<PrivateNotesToolbar {...props} />);

    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();

    const surface = screen.getByRole("button", { name: "付箋" });
    expect(surface).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it("editingDisabled中はマイ付箋の編集開始を無効化する", () => {
    const props = {
      notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
      disabled: false,
      editingDisabled: true,
      selectedNoteId: "note-1",
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      defaultExpanded: true,
    };
    render(<PrivateNotesToolbar {...props} />);

    const surface = screen.getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(surface, { pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it("canCreateNoteがfalseの場合は追加ボタンを無効化する", () => {
    render(
      <PrivateNotesToolbar
        notes={[]}
        disabled={false}
        canCreateNote={false}
        canMoveNote={true}
        canEditNote={true}
        canDeleteNote={false}
        selectedNoteId={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
        defaultExpanded
      />,
    );

    expect(screen.getByRole("button", { name: "付箋を追加" })).toBeDisabled();
  });

  it("canEditNoteがfalseの場合は編集できない", () => {
    render(
      <PrivateNotesToolbar
        notes={[buildNote({ id: "note-1", visibility: "private" })]}
        disabled={false}
        canCreateNote={true}
        canMoveNote={true}
        canEditNote={false}
        canDeleteNote={false}
        defaultExpanded
        selectedNoteId="note-1"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const surface = screen.getByRole("button", { name: "付箋" });

    fireEvent.pointerDown(surface, { pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    fireEvent.pointerDown(surface, { pointerId: 2 });
    fireEvent.pointerUp(surface, { pointerId: 2 });

    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it("canDeleteNoteがfalseの場合はBackspace/Deleteで削除できない", () => {
    const onDelete = vi.fn();

    render(
      <PrivateNotesToolbar
        notes={[buildNote({ visibility: "private" })]}
        disabled={false}
        canCreateNote={true}
        canMoveNote={true}
        canEditNote={true}
        canDeleteNote={false}
        selectedNoteId={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={onDelete}
        onDragStart={vi.fn()}
        defaultExpanded
      />,
    );

    const surface = screen.getByRole("button", { name: "付箋" });

    fireEvent.keyDown(surface, { key: "Backspace" });
    fireEvent.keyDown(surface, { key: "Delete" });

    expect(onDelete).not.toHaveBeenCalled();
  });
});
