import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { useNoteAutosave } from "../logic/use-note-autosave";
import { PrivateNotesToolbar } from "./private-notes-toolbar";

function setup(disabled = false, selectedNoteId: string | null = null) {
  const props = {
    notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
    disabled,
    selectedNoteId,
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

type ToolbarProps = ComponentProps<typeof PrivateNotesToolbar>;

function SelectionHarness({
  notes,
  props,
}: {
  notes: ToolbarProps["notes"];
  props: ToolbarProps;
}) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    "old-note",
  );
  return (
    <PrivateNotesToolbar
      {...props}
      notes={notes}
      noteCreationReceipt={
        notes.some((note) => note.id === "new-note")
          ? { operationId: "create-1", noteId: "new-note" }
          : undefined
      }
      selectedNoteId={selectedNoteId}
      onSelect={(id) => {
        props.onSelect(id);
        setSelectedNoteId(id);
      }}
    />
  );
}

describe("PrivateNotesToolbar", () => {
  it.each([false, true])(
    "ヒントから文例入りの付箋を追加して新規本文へfocusする（追加執筆: %s）",
    (workspaceCollapsible) => {
      const question = "どうしたら、忘れ物を減らせるか？";
      const oldNote = buildNote({
        id: "hint-old",
        visibility: "private",
        content: "自分の下書き",
      });
      const created = buildNote({
        id: "hint-created",
        visibility: "private",
        content: question,
      });
      const addActionRef: { current: ((content?: string) => void) | null } = {
        current: null,
      };
      const props = {
        notes: [oldNote],
        disabled: false,
        selectedNoteId: null,
        canCreateNote: true,
        canDeleteNote: true,
        canMoveNote: true,
        canEditNote: true,
        onSelect: vi.fn(),
        onAdd: vi.fn(() => "hint-create"),
        onContentChange: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        addActionRef,
        workspaceCollapsible,
      };
      const view = render(
        <PrivateNotesToolbar {...props} presentation="workspace" />,
      );
      act(() => addActionRef.current?.(question));
      expect(props.onAdd).toHaveBeenCalledExactlyOnceWith(question);
      view.rerender(
        <PrivateNotesToolbar
          {...props}
          presentation="workspace"
          notes={[oldNote, created]}
          selectedNoteId={created.id}
          noteCreationReceipt={{
            operationId: "hint-create",
            noteId: created.id,
          }}
        />,
      );
      expect(screen.getByDisplayValue(question)).toHaveFocus();
      expect(screen.getByDisplayValue("自分の下書き")).toHaveValue(
        "自分の下書き",
      );
      expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
        "data-expanded",
        String(!workspaceCollapsible),
      );
    },
  );

  it("自分だけに表示の直下に本文入力欄をひとつ置き、一覧では保存済みの付箋だけを表示する", () => {
    render(
      <PrivateNotesToolbar
        notes={[
          buildNote({ id: "a", visibility: "private", content: "" }),
          buildNote({ id: "b", visibility: "private", content: "B" }),
        ]}
        disabled={false}
        selectedNoteId="a"
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
        presentation="workspace"
      />,
    );
    const privacy = screen.getByText("自分だけに表示", { exact: true });
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    const scroll = screen.getByTestId("private-notes-scroll");
    expect(privacy.compareDocumentPosition(composer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(composer.compareDocumentPosition(scroll)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(scroll).not.toContainElement(composer);
    expect(composer).toHaveAccessibleDescription(
      "Enterで追加 · Shift+Enterで改行",
    );
    expect(within(scroll).getAllByTestId("note-card")).toHaveLength(2);
    expect(within(scroll).queryByPlaceholderText("メモを入力...")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /付箋を追加/ }),
    ).not.toBeInTheDocument();
  });

  it("問いの例があっても書いた付箋だけが自分の一覧を先頭から埋める", () => {
    render(
      <PrivateNotesToolbar
        notes={[buildNote({ id: "mine", visibility: "private" })]}
        exampleNotes={["どうすれば、忘れ物を減らせるだろう？"]}
        disabled={false}
        selectedNoteId={null}
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
        presentation="workspace"
      />,
    );

    const list = screen.getByTestId("private-notes-list");
    expect(screen.getByTestId("example-note-1")).toBeVisible();
    expect(list.firstElementChild).toBe(screen.getByTestId("note-card"));
  });

  it("workspaceからdockへ切り替わるとマイ付箋を展開する", () => {
    const props = {
      notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
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
    };
    const view = render(
      <PrivateNotesToolbar
        {...props}
        presentation="workspace"
        defaultExpanded
      />,
    );

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        presentation="dock"
        expandOnWorkspaceExit
        defaultExpanded={false}
      />,
    );

    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("View Transition中から完了後までマイ付箋を展開したままにする", () => {
    const props = {
      notes: [buildNote({ visibility: "private", content: "非公開の考え" })],
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
    };
    const view = render(
      <PrivateNotesToolbar
        {...props}
        presentation="workspace"
        defaultExpanded
        workspaceExitTransitionPending={false}
      />,
    );

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        presentation="dock"
        expandOnWorkspaceExit
        defaultExpanded={false}
        workspaceExitTransitionPending
      />,
    );

    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        presentation="dock"
        expandOnWorkspaceExit
        defaultExpanded={false}
        workspaceExitTransitionPending={false}
      />,
    );

    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("1-2へのworkspace遷移が完了してもdockを開いたままにする", () => {
    const props = {
      notes: [
        buildNote({ visibility: "private", content: "共有するアイデア" }),
      ],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: false,
      canDeleteNote: false,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(
      <PrivateNotesToolbar
        {...props}
        presentation="workspace"
        defaultExpanded
        workspaceExitTransitionPending={false}
      />,
    );

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        presentation="dock"
        expandOnWorkspaceExit
        defaultExpanded
        workspaceExitTransitionPending
      />,
    );

    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        presentation="dock"
        expandOnWorkspaceExit
        defaultExpanded
        workspaceExitTransitionPending={false}
      />,
    );

    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "マイ付箋を閉じる" }),
    ).not.toBeInTheDocument();
  });

  it("作成待ちの応答後に入力欄を空にしてフォーカスを保つ", () => {
    const oldNote = buildNote({ id: "old", visibility: "private" });
    const newNote = buildNote({
      id: "new",
      visibility: "private",
      content: "入力した本文",
    });
    const props = {
      notes: [oldNote],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<PrivateNotesToolbar {...props} />);
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    composer.focus();
    fireEvent.change(composer, { target: { value: newNote.content } });
    fireEvent.keyDown(composer, { key: "Enter" });
    view.rerender(<PrivateNotesToolbar {...props} noteCreationPending />);
    expect(composer).toBeEnabled();
    expect(composer).toHaveFocus();
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[oldNote, newNote]}
        selectedNoteId="new"
        noteCreationReceipt={{ operationId: "create-1", noteId: "new" }}
      />,
    );
    expect(props.onSelect).not.toHaveBeenCalledWith("new");
    expect(composer).toHaveValue("");
    expect(composer).toHaveFocus();
  });
  it("本文から追加を指示しただけなら保存確認を待たず対応する新規本文へ移る", () => {
    const oldNote = buildNote({
      id: "old",
      visibility: "private",
      content: "旧本文",
    });
    const newNote = buildNote({
      id: "new",
      visibility: "private",
      content: "",
    });
    const props = {
      notes: [oldNote],
      disabled: false,
      selectedNoteId: "old",
      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<PrivateNotesToolbar {...props} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "付箋" }), {
      key: "Enter",
    });
    const editor = within(screen.getByTestId("note-card")).getByRole("textbox");
    fireEvent.change(editor, { target: { value: "最新の入力" } });
    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    expect(props.onContentChange).toHaveBeenCalledWith("old", "最新の入力");
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        addRequest={1}
        notes={[oldNote, newNote]}
        selectedNoteId="new"
        noteCreationReceipt={{ operationId: "create-1", noteId: "new" }}
      />,
    );
    expect(
      within(screen.getAllByTestId("note-card")[1]).getByRole("textbox"),
    ).toHaveFocus();
  });

  it("別の作成結果や一覧の差分だけでは選択とフォーカスを移さない", () => {
    const props = {
      notes: [buildNote({ id: "old", visibility: "private" })],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<PrivateNotesToolbar {...props} />);
    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[
          ...props.notes,
          buildNote({ id: "other", visibility: "private" }),
        ]}
        noteCreationPending
        noteCreationReceipt={{ operationId: "other-create", noteId: "other" }}
      />,
    );
    expect(props.onSelect).not.toHaveBeenCalledWith("other");
    expect(
      within(screen.getAllByTestId("note-card")[1]).getByRole("textbox"),
    ).toHaveAttribute("readonly");
  });

  it("作成待ちに工程の文脈が変わったら、対応する応答でも入力を奪わない", () => {
    const props = {
      notes: [],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(
      <PrivateNotesToolbar {...props} noteCreationFocusContext="1-1:1" />,
    );
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        noteCreationFocusContext="1-1:1"
        addRequest={1}
      />,
    );
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        noteCreationFocusContext="2-1:2"
        notes={[buildNote({ id: "new", visibility: "private" })]}
        noteCreationReceipt={{ operationId: "create-1", noteId: "new" }}
      />,
    );
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("note-card")).getByRole("textbox"),
    ).toHaveAttribute("readonly");
  });
  it("一覧内ではボード上の座標を使わず、付箋を縦一列に配置する", () => {
    render(
      <PrivateNotesToolbar
        notes={[
          buildNote({
            id: "offset-note",
            visibility: "private",
            x: 480,
            y: 720,
          }),
        ]}
        disabled={false}
        selectedNoteId={null}
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByTestId("note-card")).toHaveStyle({
      left: "0px",
      top: "0px",
    });
  });

  it("並べ替えが続いてもFLIPを重ねず、前の移動アニメーションを解除する", () => {
    const first = buildNote({ id: "first", visibility: "private" });
    const second = buildNote({ id: "second", visibility: "private" });
    const props = {
      notes: [first, second],
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
    const view = render(<PrivateNotesToolbar {...props} />);
    const [firstCard, secondCard] = screen.getAllByTestId("note-card");
    if (!firstCard || !secondCard) throw new Error("付箋がありません");

    const geometryEvents: string[] = [];
    const topById: Record<string, number> = { first: 0, second: 0 };
    for (const [id, card] of [
      ["first", firstCard],
      ["second", secondCard],
    ] as const) {
      Object.defineProperty(card, "offsetTop", {
        get: () => {
          geometryEvents.push("read");
          return topById[id];
        },
      });
    }
    const firstAnimation = { cancel: vi.fn() } as unknown as Animation;
    const firstAnimate = vi.fn(() => {
      geometryEvents.push("write");
      return firstAnimation;
    });
    Object.defineProperty(firstCard, "animate", {
      configurable: true,
      value: firstAnimate,
    });
    Object.defineProperty(secondCard, "animate", {
      configurable: true,
      value: vi.fn(() => {
        geometryEvents.push("write");
        return { cancel: vi.fn() } as unknown as Animation;
      }),
    });

    topById.first = 144;
    topById.second = 0;
    view.rerender(<PrivateNotesToolbar {...props} notes={[second, first]} />);
    expect(firstAnimate).toHaveBeenCalledOnce();

    // ドラッグ中のポインター更新では、同じ順序の要素に再アニメーションしない。
    topById.first = 300;
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[second, first]}
        selectedNoteId="first"
      />,
    );
    expect(firstAnimate).toHaveBeenCalledOnce();

    geometryEvents.length = 0;
    topById.first = 0;
    topById.second = 144;
    view.rerender(<PrivateNotesToolbar {...props} />);

    expect(firstAnimation.cancel).toHaveBeenCalledOnce();
    expect(geometryEvents).toEqual(["read", "read", "write", "write"]);
  });

  it("ドラッグ中の付箋を挿入位置のプレースホルダーへ置き換える", () => {
    render(
      <PrivateNotesToolbar
        notes={[
          buildNote({ id: "before", visibility: "private" }),
          buildNote({ id: "returning", visibility: "private", color: "blue" }),
          buildNote({ id: "after", visibility: "private" }),
        ]}
        dropPlaceholder={{ noteId: "returning" }}
        disabled={false}
        selectedNoteId={null}
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const list = screen.getByTestId("private-notes-list");
    expect(within(list).getAllByTestId("note-card")).toHaveLength(2);
    const placeholder = within(list).getByTestId("private-note-placeholder");
    expect(placeholder).toHaveAttribute("data-note-id", "returning");
    expect(placeholder).toHaveClass("animate-in", "fade-in", "duration-150");
    expect(
      Array.from(list.children).map((child) =>
        child.getAttribute("data-note-id"),
      ),
    ).toEqual(["before", "returning", "after"]);
  });

  it("初期状態は開いて表示し、閉じると一覧を隠して操作欄を残す", () => {
    const onAdd = vi.fn(() => "create-1");
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
    expect(toolbar).toHaveClass(
      "w-[min(15rem,calc(100vw-1.5rem))]",
      "flex-col",
    );
    expect(toolbar).toHaveClass("h-[min(48rem,calc(100vh-6rem))]");
    expect(toolbar).not.toHaveClass("h-fit");
    expect(toolbar).not.toHaveClass("max-h-[min(48rem,calc(100vh-6rem))]");
    const controls = screen.getByTestId("private-notes-controls");
    expect(
      screen.getByRole("heading", { name: "マイ付箋" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("private-notes-header")).toContainElement(
      screen.getByRole("textbox", { name: "付箋を書く" }),
    );
    expect(screen.queryByText("1件")).not.toBeInTheDocument();
    expect(
      screen.queryByText("自分だけに表示されています"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付箋" })).toBeInTheDocument();
    expect(screen.getByText(/Enterで追加/)).toBeVisible();

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

    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    fireEvent.change(composer, { target: { value: "追加本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("追加本文");
    expect(toolbar).toHaveAttribute("data-expanded", "false");
  });

  it("追加執筆では入力欄を保ったまま、一覧の余白からエリアを開く", () => {
    const onWorkspaceExpandedChange = vi.fn();
    const onAdd = vi.fn(() => "create-1");
    render(
      <PrivateNotesToolbar
        notes={[buildNote({ id: "draft-1", visibility: "private" })]}
        disabled={false}
        selectedNoteId={null}
        canCreateNote
        canDeleteNote
        canMoveNote
        canEditNote
        presentation="workspace"
        workspaceCollapsible
        workspaceExpanded={false}
        onWorkspaceExpandedChange={onWorkspaceExpandedChange}
        onSelect={vi.fn()}
        onAdd={onAdd}
        onContentChange={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("private-notes-scroll"));
    expect(onWorkspaceExpandedChange).toHaveBeenCalledWith(true);

    onWorkspaceExpandedChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "付箋" }));
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    fireEvent.change(composer, { target: { value: "追加本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(onWorkspaceExpandedChange).not.toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("追加本文");
    expect(screen.getByTestId("private-notes-header")).toContainElement(
      composer,
    );
    expect(screen.getByTestId("private-notes-controls")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "マイ付箋を展開" }),
    ).not.toBeInTheDocument();
  });

  it("個人付箋を表示し、追加と削除を操作できる", () => {
    const props = setup(false, "note-1");
    expect(screen.getByDisplayValue("非公開の考え")).toBeInTheDocument();
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    fireEvent.change(composer, { target: { value: "追加する本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    const surface = screen.getByRole("button", { name: "付箋" });
    fireEvent.keyDown(surface, { key: "Delete" });

    expect(props.onAdd).toHaveBeenCalledExactlyOnceWith("追加する本文");
    expect(props.onDelete).toHaveBeenCalledWith("note-1");
  });

  it("ボード付箋と同じ付箋スタイルで表示し、投票UIは表示しない", () => {
    setup();

    const note = screen.getByTestId("note-card");
    expect(note).toHaveAttribute("data-slot", "sticky-note");
    expect(note.querySelector('[data-slot="sticky-note-paper"]')).toHaveStyle({
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
      width: "200px",
      height: "150px",
    });
    expect(
      screen
        .getByRole("textbox", { name: "付箋を書く" })
        .closest("[data-slot='card-header']"),
    ).toBeInTheDocument();
  });

  it("0枚・1枚・多数でも同じ画面サイズの展開寸法を保つ", () => {
    const props = {
      notes: [],
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
    const view = render(<PrivateNotesToolbar {...props} />);
    const toolbar = screen.getByTestId("private-notes-toolbar");
    const expandedHeight = "h-[min(48rem,calc(100vh-6rem))]";

    expect(toolbar).toHaveClass(expandedHeight);

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[buildNote({ id: "one-note", visibility: "private" })]}
      />,
    );
    expect(toolbar).toHaveClass(expandedHeight);

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={Array.from({ length: 8 }, (_, index) =>
          buildNote({
            id: `note-${index + 1}`,
            visibility: "private",
            content: `付箋 ${index + 1}`,
          }),
        )}
      />,
    );
    expect(toolbar).toHaveClass(expandedHeight);
    expect(screen.getByTestId("private-notes-scroll")).toHaveClass(
      "overflow-y-auto",
    );
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
    const onAdd = vi.fn(() => "create-1");
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

    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[oldNote, newNote]}
        selectedNoteId="new-note"
        noteCreationReceipt={{ operationId: "create-1", noteId: "new-note" }}
      />,
    );

    const textboxes = screen
      .getAllByTestId("note-card")
      .map((card) => within(card).getByRole("textbox"));
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

  it("2行目に追加した5・6枚目はスクロールに任せてその場に表示する", () => {
    const initialNotes = Array.from({ length: 4 }, (_, index) =>
      buildNote({
        id: `note-${index + 1}`,
        visibility: "private",
        content: `付箋 ${index + 1}`,
      }),
    );
    const fifthNote = buildNote({
      id: "note-5",
      visibility: "private",
      content: "付箋 5",
    });
    const sixthNote = buildNote({
      id: "note-6",
      visibility: "private",
      content: "付箋 6",
    });
    let scrollTop = 0;
    const onAdd = vi
      .fn()
      .mockReturnValueOnce("create-5")
      .mockReturnValueOnce("create-6");
    const props = {
      notes: initialNotes,
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd,
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      presentation: "workspace" as const,
    };
    const view = render(<PrivateNotesToolbar {...props} />);
    const scrollContainer = screen.getByTestId("private-notes-scroll");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 200 },
      clientTop: { configurable: true, value: 0 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollTo: {
        configurable: true,
        value: vi.fn(({ top }: ScrollToOptions) => {
          if (typeof top === "number") scrollTop = top;
        }),
      },
    });
    const scrollTo = scrollContainer.scrollTo as unknown as ReturnType<
      typeof vi.fn
    >;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this === scrollContainer) return new DOMRect(0, 0, 500, 200);
        if (["note-5", "note-6"].includes(this.dataset.noteId ?? "")) {
          return new DOMRect(0, 250 - scrollTop, 200, 100);
        }
        return new DOMRect(0, 0, 200, 100);
      },
    );

    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[...initialNotes, fifthNote]}
        selectedNoteId="note-5"
        noteCreationReceipt={{ operationId: "create-5", noteId: "note-5" }}
      />,
    );

    const fifthCard = screen.getAllByTestId("note-card")[4];
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: "smooth" });
    expect(fifthCard).not.toHaveClass("animate-in");
    expect(fifthCard).not.toHaveClass("slide-in-from-bottom-2");

    view.rerender(<PrivateNotesToolbar {...props} addRequest={2} />);
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[...initialNotes, fifthNote, sixthNote]}
        selectedNoteId="note-6"
        noteCreationReceipt={{ operationId: "create-6", noteId: "note-6" }}
      />,
    );

    expect(scrollTo).toHaveBeenCalledOnce();
    expect(fifthCard).not.toHaveClass("animate-in");
    const sixthCard = screen.getAllByTestId("note-card")[5];
    expect(sixthCard).not.toHaveClass("animate-in");
    expect(sixthCard).not.toHaveClass("slide-in-from-bottom-2");
  });

  it("入力が続いていなければフォーカス変更後も新しい付箋を表示する", () => {
    const oldNote = buildNote({
      id: "old-note",
      visibility: "private",
      content: "前の付箋",
    });
    const newNote = buildNote({
      id: "new-note",
      visibility: "private",
      content: "",
    });
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
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<PrivateNotesToolbar {...props} />);

    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    fireEvent.focusIn(screen.getByRole("button", { name: "付箋" }));
    view.rerender(
      <PrivateNotesToolbar
        {...props}
        notes={[oldNote, newNote]}
        noteCreationReceipt={{ operationId: "create-1", noteId: "new-note" }}
      />,
    );

    expect(props.onSelect).not.toHaveBeenCalledWith("new-note");
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

  it("追加応答を待つ間に既存下書きへ入力を戻した場合はフォーカスと選択を奪わない", () => {
    const oldNote = buildNote({
      id: "old-note",
      visibility: "private",
      content: "既存の本文",
    });
    const newNote = buildNote({
      id: "new-note",
      visibility: "private",
      content: "",
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const props = {
      notes: [oldNote],
      disabled: false,
      selectedNoteId: "old-note",
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
    const view = render(<SelectionHarness props={props} notes={[oldNote]} />);
    view.rerender(
      <SelectionHarness
        props={{ ...props, addRequest: 1 }}
        notes={[oldNote]}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "付箋" }), {
      key: "Enter",
    });
    const editor = within(screen.getByTestId("note-card")).getByRole("textbox");
    fireEvent.input(editor, { target: { value: "既存draftへ入力を続ける" } });
    expect(editor).toHaveFocus();

    view.rerender(
      <SelectionHarness props={props} notes={[oldNote, newNote]} />,
    );

    expect(editor).toHaveFocus();
    expect(editor).toHaveValue("既存draftへ入力を続ける");
    expect(props.onSelect).not.toHaveBeenCalledWith("new-note");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(
      within(screen.getAllByTestId("note-card")[1]).getByRole("textbox"),
    ).toHaveAttribute("readonly");
  });

  it("外部からの追加リクエストでも入力欄へフォーカスする", () => {
    const oldNote = buildNote({ id: "old-note", content: "前の付箋" });
    const newNote = buildNote({
      id: "new-note",
      visibility: "private",
      content: "",
      createdAt: "2026-07-03T00:01:00.000Z",
    });
    const props = {
      notes: [oldNote],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "create-1"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
      addRequest: 0,
    };
    const view = render(<PrivateNotesToolbar {...props} />);

    view.rerender(<PrivateNotesToolbar {...props} addRequest={1} />);
    expect(props.onAdd).toHaveBeenCalledOnce();

    view.rerender(
      <PrivateNotesToolbar
        {...props}
        addRequest={1}
        notes={[oldNote, newNote]}
        selectedNoteId="new-note"
        noteCreationReceipt={{ operationId: "create-1", noteId: "new-note" }}
      />,
    );

    expect(
      within(screen.getAllByTestId("note-card")[1]).getByRole("textbox"),
    ).toHaveFocus();
  });

  it("保存確認表示を出さず、対応するACKまで最新本文の下書きを保持する", () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    try {
      const note = buildNote({
        id: "save-note",
        authorId: "author",
        visibility: "private",
        content: "原文",
      });
      const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
      const hook = renderHook(() =>
        useNoteAutosave({ roomId: "toolbar-room", userId: "author", send }),
      );
      act(() =>
        hook.result.current.applyMessage({
          type: "snapshot",
          notes: [note],
          members: [],
          phase: buildPhaseStep(1),
          phaseRevision: 1,

          decision: null,
          carryovers: [],
          completedVoterIds: [],
          timer: { status: "idle" },
          serverNow: 0,
        }),
      );
      const props = {
        notes: [note],
        disabled: false,
        selectedNoteId: "save-note",
        canCreateNote: true,
        canDeleteNote: true,
        canMoveNote: true,
        canEditNote: true,
        onSelect: vi.fn(),
        onAdd: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onContentChange: hook.result.current.blur,
        onDraftChange: hook.result.current.change,
      };
      const view = render(
        <PrivateNotesToolbar
          {...props}
          draftValue={hook.result.current.draftValue}
        />,
      );
      fireEvent.keyDown(screen.getByRole("button", { name: "付箋" }), {
        key: "Enter",
      });
      fireEvent.change(
        within(screen.getByTestId("note-card")).getByRole("textbox"),
        {
          target: { value: "受理を待つ本文" },
        },
      );
      view.rerender(
        <PrivateNotesToolbar
          {...props}
          draftValue={hook.result.current.draftValue}
        />,
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(hook.result.current.draftValue(note.id)).toBe("受理を待つ本文");
      expect(send).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1000));
      const request = send.mock.calls[0]?.[0];
      if (request?.type !== "note:update-content")
        throw new Error("本文送信がありません");
      // 他の操作のACKや付箋の配信だけでは、本人の受理確認を済ませない。
      act(() =>
        hook.result.current.applyMessage({
          type: "note:updated",
          note: { ...note, content: "受理を待つ本文", contentRevision: 1 },
        }),
      );
      act(() =>
        hook.result.current.applyMessage({
          type: "note:content-saved",
          noteId: note.id,
          operationId: "unrelated",
          contentRevision: 1,
        }),
      );
      view.rerender(
        <PrivateNotesToolbar
          {...props}
          draftValue={hook.result.current.draftValue}
        />,
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(hook.result.current.draftValue(note.id)).toBe("受理を待つ本文");
      act(() => vi.advanceTimersByTime(3000));
      expect(send).toHaveBeenLastCalledWith({
        type: "note:content-status",
        operationId: request.operationId,
      });
      act(() =>
        hook.result.current.applyMessage({
          type: "note:content-status-result",
          operationId: request.operationId,
          status: "accepted",
          noteId: note.id,
          contentRevision: 1,
        }),
      );
      view.rerender(
        <PrivateNotesToolbar
          {...props}
          draftValue={hook.result.current.draftValue}
        />,
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      sessionStorage.clear();
    }
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

    const textarea = within(screen.getByTestId("note-card")).getByRole(
      "textbox",
    );
    fireEvent.change(textarea, { target: { value: "書き換えた内容" } });
    fireEvent.blur(textarea);

    expect(props.onContentChange).toHaveBeenCalledWith(
      "note-1",
      "書き換えた内容",
    );
  });

  it("編集途中で折り畳んでも下書きを保ち、再展開後に続きから編集できる", () => {
    const props = {
      notes: [
        buildNote({
          id: "note-1",
          visibility: "private",
          content: "保存前の本文",
        }),
      ],
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

    fireEvent.click(screen.getByRole("button", { name: "付箋" }));
    const noteEditor = within(screen.getByTestId("note-card")).getByRole(
      "textbox",
    );
    fireEvent.change(noteEditor, {
      target: { value: "折り畳み前の下書き" },
    });
    fireEvent.click(screen.getByRole("button", { name: "マイ付箋を閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "マイ付箋を開く" }));

    expect(noteEditor).toHaveValue("折り畳み前の下書き");
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

    expect(screen.getByRole("textbox", { name: "付箋を書く" })).toBeDisabled();

    const surface = screen.getByRole("button", { name: "付箋" });
    expect(surface).toHaveAttribute("aria-disabled", "true");
    expect(
      within(screen.getByTestId("note-card")).getByRole("textbox"),
    ).toHaveAttribute("readonly");
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

    expect(
      within(screen.getByTestId("note-card")).getByRole("textbox"),
    ).toHaveAttribute("readonly");
  });

  it("作成権限がないdockは追加と開閉の操作を表示しない", () => {
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

    expect(screen.queryByRole("button", { name: "付箋を追加" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "付箋を書く" })).toBeNull();
  });

  it.each(["dock", "workspace"] as const)(
    "%sでは作成権限を失うと追加ショートカットの案内を隠す",
    (presentation) => {
      const props = {
        notes: [],
        disabled: false,
        selectedNoteId: null,
        canCreateNote: true,
        canEditNote: false,
        canDeleteNote: false,
        canMoveNote: false,
        onSelect: vi.fn(),
        onAdd: vi.fn(),
        onContentChange: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        presentation,
      };
      const view = render(<PrivateNotesToolbar {...props} />);
      expect(screen.getByText(/Enterで追加/)).toBeVisible();
      view.rerender(<PrivateNotesToolbar {...props} canCreateNote={false} />);
      expect(screen.queryByText(/Enterで追加/)).not.toBeInTheDocument();
    },
  );

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

    expect(
      within(screen.getByTestId("note-card")).getByRole("textbox"),
    ).toHaveAttribute("readonly");
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

it("AT-011: 選択中のprivate削除完了後は追加入口へfocusを戻す", () => {
  const props = {
    notes: [buildNote({ visibility: "private" })],
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
  };
  const view = render(<PrivateNotesToolbar {...props} />);
  const surface = screen.getByRole("button", { name: "付箋" });
  surface.focus();
  fireEvent.keyDown(surface, { key: "Delete" });
  view.rerender(
    <PrivateNotesToolbar {...props} notes={[]} selectedNoteId={null} />,
  );
  expect(screen.getByRole("textbox", { name: "付箋を書く" })).toHaveFocus();
});
it("AT-023: private一覧のIME Escapeでは選択を解除しない", () => {
  const props = setup(false, "note-1");
  fireEvent.keyDown(screen.getByRole("button", { name: "付箋" }), {
    key: "Escape",
    isComposing: true,
  });
  expect(props.onSelect).not.toHaveBeenCalled();
});

describe("追加執筆のマイ付箋", () => {
  function props() {
    return {
      presentation: "workspace" as const,
      workspaceCollapsible: true,
      workspaceExpanded: false,
      onWorkspaceExpandedChange: vi.fn(),
      notes: [buildNote({ id: "draft", visibility: "private" })],
      disabled: false,
      selectedNoteId: null,
      canCreateNote: true,
      canDeleteNote: true,
      canMoveNote: true,
      canEditNote: true,
      onSelect: vi.fn(),
      onAdd: vi.fn(() => "addition"),
      onContentChange: vi.fn(),
      onDelete: vi.fn(),
      onDragStart: vi.fn(),
    };
  }
  it.each(["workspace", "dock"] as const)(
    "%sでは付箋一覧の操作と別に本文入力欄を表示する",
    (presentation) => {
      render(
        <PrivateNotesToolbar
          {...props()}
          presentation={presentation}
          workspaceCollapsible={presentation === "workspace"}
        />,
      );

      expect(screen.getByRole("textbox", { name: "付箋を書く" })).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /付箋を追加/ }),
      ).not.toBeInTheDocument();
    },
  );
  it("Enterで本文入り付箋を作成し、確定後も空の入力欄にフォーカスを保つ", () => {
    const options = props();
    const onAdd = vi.fn(() => "addition");
    const view = render(
      <PrivateNotesToolbar {...options} notes={[]} onAdd={onAdd} />,
    );
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    const content = "入力してから追加する";
    composer.focus();
    fireEvent.change(composer, { target: { value: content } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledExactlyOnceWith(content);
    expect(composer).toHaveValue(content);

    view.rerender(
      <PrivateNotesToolbar
        {...options}
        notes={[buildNote({ id: "created", visibility: "private", content })]}
        onAdd={onAdd}
        noteCreationReceipt={{ operationId: "addition", noteId: "created" }}
      />,
    );

    expect(composer).toHaveValue("");
    expect(composer).toHaveFocus();
  });
  it("縮小中に同じ段へ追加した付箋の移動を、展開時に終了する", () => {
    const options = props();
    const view = render(<PrivateNotesToolbar {...options} />);
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    Object.defineProperty(
      screen.getByTestId("private-notes-scroll"),
      "clientHeight",
      {
        value: 200,
      },
    );
    const content = "同じ段に入る本文";
    composer.focus();
    fireEvent.change(composer, { target: { value: content } });
    fireEvent.keyDown(composer, { key: "Enter" });
    const notes = [
      ...options.notes,
      buildNote({ id: "created", visibility: "private", content }),
    ];
    view.rerender(<PrivateNotesToolbar {...options} notes={notes} />);
    const card = screen.getAllByTestId("note-card")[1];
    const animation = { cancel: vi.fn() };
    const animate = vi.fn(() => animation);
    Object.defineProperty(card, "animate", { value: animate });

    const created = {
      ...options,
      notes,
      noteCreationReceipt: { operationId: "addition", noteId: "created" },
    };
    view.rerender(<PrivateNotesToolbar {...created} />);
    expect(animate).toHaveBeenCalledOnce();
    expect(animation.cancel).not.toHaveBeenCalled();

    view.rerender(<PrivateNotesToolbar {...created} workspaceExpanded />);
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(composer).toHaveFocus();
  });
  it("スクロール中は着地点を同じフレームで補正し、スクロール完了後の展開でも移動を終了する", () => {
    const options = props();
    const view = render(<PrivateNotesToolbar {...options} />);
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    const list = screen.getByTestId("private-notes-scroll");
    let scrollTop = 0;
    Object.defineProperties(list, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 400 },
      scrollTop: { get: () => scrollTop },
      scrollTo: {
        // スクロール位置が変わっただけでは、scroll イベントを通知しない。
        value: ({ top, behavior }: ScrollToOptions) => {
          if (top !== undefined && behavior === "instant") scrollTop = top;
        },
      },
    });
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this === list) return new DOMRect(0, 100, 500, 200);
        if (this.dataset.noteId === "created") {
          const translateY = Number.parseFloat(
            this.style.translate.split(" ")[1],
          );
          const correction = Number.isNaN(translateY) ? 0 : translateY;
          return new DOMRect(0, 310 - scrollTop + correction, 200, 150);
        }
        return new DOMRect(0, 0, 200, 80);
      });
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => frames.push(callback));
    const nextFrame = (time: number) => {
      const frame = frames.shift();
      if (!frame) throw new Error("スクロールを更新するフレームがありません");
      frame(time);
    };

    try {
      const content = "次の段に入る本文";
      composer.focus();
      fireEvent.change(composer, { target: { value: content } });
      fireEvent.keyDown(composer, { key: "Enter" });
      const created = {
        ...options,
        notes: [
          ...options.notes,
          buildNote({ id: "created", visibility: "private", content }),
        ],
        noteCreationReceipt: { operationId: "addition", noteId: "created" },
      };
      view.rerender(<PrivateNotesToolbar {...created} />);
      const card = screen.getAllByTestId("note-card")[1];
      const animation = { cancel: vi.fn() };
      const animate = vi.fn(() => animation);
      Object.defineProperty(card, "animate", { value: animate });

      nextFrame(0);
      nextFrame(80);
      expect(scrollTop).toBeGreaterThan(0);
      expect(animate).toHaveBeenCalledOnce();
      const landingTop = card.getBoundingClientRect().top;
      const previousScrollTop = scrollTop;
      nextFrame(120);
      expect(scrollTop).toBeGreaterThan(previousScrollTop);
      expect(card.getBoundingClientRect().top).toBeCloseTo(landingTop);
      nextFrame(1000);
      expect(card.style.translate).toBe("");
      expect(card.getBoundingClientRect().top).toBeCloseTo(landingTop);
      expect(animation.cancel).not.toHaveBeenCalled();

      view.rerender(<PrivateNotesToolbar {...created} workspaceExpanded />);
      expect(animation.cancel).toHaveBeenCalledOnce();
      expect(composer).toHaveFocus();
    } finally {
      view.unmount();
      requestFrame.mockRestore();
      bounds.mockRestore();
    }
  });
  it("作成待ちの間に書いた次の本文は先の応答で消さない", () => {
    const options = props();
    const onAdd = vi.fn(() => "addition");
    const view = render(
      <PrivateNotesToolbar {...options} notes={[]} onAdd={onAdd} />,
    );
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    composer.focus();
    fireEvent.change(composer, { target: { value: "先に送る本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.change(composer, { target: { value: "次に書いた本文" } });

    view.rerender(
      <PrivateNotesToolbar
        {...options}
        notes={[
          buildNote({
            id: "created",
            visibility: "private",
            content: "先に送る本文",
          }),
        ]}
        onAdd={onAdd}
        noteCreationReceipt={{ operationId: "addition", noteId: "created" }}
      />,
    );

    expect(composer).toHaveValue("次に書いた本文");
    expect(composer).toHaveFocus();
  });
  it.each(["", " \n\t "])(
    "空欄・空白だけの本文では付箋を作らない: %j",
    (content) => {
      const options = props();
      const onAdd = vi.fn(() => "addition");
      render(<PrivateNotesToolbar {...options} onAdd={onAdd} />);
      const composer = screen.getByRole("textbox", { name: "付箋を書く" });
      if (content) fireEvent.change(composer, { target: { value: content } });
      fireEvent.keyDown(composer, { key: "Enter" });

      expect(onAdd).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["Alt＋Enter", { altKey: true }],
    ["Ctrl＋Meta＋Enter", { ctrlKey: true, metaKey: true }],
    ["Enterのキーリピート", { repeat: true }],
  ])(
    "%sでは追加せず、次に押したEnterで下書きを追加する",
    (_name, modifiers) => {
      const options = props();
      render(<PrivateNotesToolbar {...options} />);
      const composer = screen.getByRole("textbox", { name: "付箋を書く" });
      const draft = "次に書いた下書き";
      fireEvent.change(composer, { target: { value: draft } });
      fireEvent.keyDown(composer, { key: "Enter", ...modifiers });

      expect(options.onAdd).not.toHaveBeenCalled();
      expect(composer).toHaveValue(draft);
      fireEvent.keyDown(composer, { key: "Enter" });
      expect(options.onAdd).toHaveBeenCalledExactlyOnceWith(draft);
    },
  );
  it("IME変換中のEnterでは追加せず、変換確定後のEnterで本文入り付箋を作る", () => {
    const options = props();
    const onAdd = vi.fn(() => "addition");
    render(<PrivateNotesToolbar {...options} onAdd={onAdd} />);
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    fireEvent.compositionStart(composer);
    fireEvent.change(composer, { target: { value: "変換中の本文" } });
    fireEvent.keyDown(composer, {
      key: "Enter",
      isComposing: true,
      keyCode: 13,
    });
    fireEvent.keyDown(composer, { key: "Enter", keyCode: 229 });

    expect(onAdd).not.toHaveBeenCalled();
    expect(composer).toHaveValue("変換中の本文");

    fireEvent.compositionEnd(composer, { data: "変換後の本文" });
    fireEvent.change(composer, { target: { value: "変換後の本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledExactlyOnceWith("変換後の本文");
  });
  it("Shift＋Enterは入力欄内で改行し、付箋を作らない", async () => {
    const options = props();
    const onAdd = vi.fn(() => "addition");
    render(<PrivateNotesToolbar {...options} onAdd={onAdd} />);
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    const user = userEvent.setup();
    await user.type(composer, "1行目");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(composer).toHaveValue("1行目\n");
    expect(onAdd).not.toHaveBeenCalled();
  });
  it("縮小中も本文入力欄を表示し、追加してもエリアを展開しない", () => {
    const options = props();
    render(<PrivateNotesToolbar {...options} />);
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "広げる" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByRole("heading", { name: "マイ付箋" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("note-card")).toBeVisible();
    const composer = screen.getByRole("textbox", { name: "付箋を書く" });
    expect(composer).toBeVisible();
    fireEvent.change(composer, { target: { value: "続けて書く本文" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(options.onAdd).toHaveBeenCalledExactlyOnceWith("続けて書く本文");
    expect(options.onWorkspaceExpandedChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });
  it("付箋がない縮小エリアにも本文入力欄を表示する", () => {
    render(<PrivateNotesToolbar {...props()} notes={[]} />);
    expect(screen.getByRole("textbox", { name: "付箋を書く" })).toBeVisible();
    expect(screen.getByTestId("private-notes-scroll")).toBeVisible();
  });
  it("広げる・縮めるボタンで、書きかけの本文と選択位置を保ったまま切り替える", async () => {
    const options = props();
    const view = render(<PrivateNotesToolbar {...options} />);
    const composer = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "付箋を書く",
    });
    const user = userEvent.setup();
    composer.focus();
    fireEvent.change(composer, { target: { value: "書きかけの本文" } });
    composer.setSelectionRange(2, 5);

    await user.click(screen.getByRole("button", { name: "広げる" }));
    expect(options.onWorkspaceExpandedChange).toHaveBeenLastCalledWith(true);
    view.rerender(<PrivateNotesToolbar {...options} workspaceExpanded />);
    expect(screen.getByRole("heading", { name: "マイ付箋" })).toBeVisible();
    const collapse = screen.getByRole("button", { name: "縮める" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);
    expect(options.onWorkspaceExpandedChange).toHaveBeenLastCalledWith(false);
    view.rerender(<PrivateNotesToolbar {...options} />);
    expect(screen.getByRole("textbox", { name: "付箋を書く" })).toBe(composer);
    expect(composer).toHaveValue("書きかけの本文");
    expect(composer).toHaveFocus();
    expect([composer.selectionStart, composer.selectionEnd]).toEqual([2, 5]);
  });
  it("展開で入力要素を作り直さず、選択範囲と変換中の本文を保つ", () => {
    const options = props();
    const view = render(
      <PrivateNotesToolbar {...options} selectedNoteId="draft" />,
    );
    const editor = within(screen.getByTestId("note-card")).getByRole("textbox");
    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "変換中の本文" } });
    (editor as HTMLTextAreaElement).setSelectionRange(2, 4);
    view.rerender(
      <PrivateNotesToolbar
        {...options}
        selectedNoteId="draft"
        workspaceExpanded
      />,
    );
    expect(within(screen.getByTestId("note-card")).getByRole("textbox")).toBe(
      editor,
    );
    expect(editor).toHaveValue("変換中の本文");
    expect((editor as HTMLTextAreaElement).selectionStart).toBe(2);
    expect((editor as HTMLTextAreaElement).selectionEnd).toBe(4);
  });
});
