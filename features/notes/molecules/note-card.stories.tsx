import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { NoteCard } from "./note-card";

const meta = {
  title: "Notes/NoteCard",
  component: NoteCard,
  parameters: {
    layout: "padded",
  },
  args: {
    note: buildNote(),
    isOwnDrag: false,
    isSelected: false,
    canEditNote: true,
    canDeleteNote: true,
    canMoveNote: true,
    onSelect: fn(),
    onDragStart: fn(),
    onContentChange: fn(),
    onDelete: fn(),
    vote: {
      displayMode: "hidden",
      selectedKind: null,
      voteRemaining: { subjective: 1, objective: 3 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 400, height: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    note: buildNote({ content: "" }),
  },
};

export const LongContent: Story = {
  args: {
    note: buildNote({
      content:
        "長めのメモの例です。付箋の高さに収まらない場合はスクロールして読めるようにしています。",
    }),
  },
};

// 選択状態: 青い枠が付き、Backspace/Deleteで削除・再クリックまたは文字入力で編集に入る。
export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const DirectInput: Story = {
  args: {
    isSelected: true,
    note: buildNote({ content: "" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole("button", { name: "付箋" });
    surface.focus();
    await userEvent.keyboard("a");
    await expect(canvas.getByRole("textbox")).toHaveValue("a");
  },
};

// 自分がドラッグ中: 「持ち上げた」表現として影が深くなる。
export const Dragging: Story = {
  args: {
    isSelected: true,
    isOwnDrag: true,
  },
};

export const Voted: Story = {
  args: {
    note: buildNote({
      dotVotes: {
        subjective: { count: 1, votedByMe: true, ownCount: 1 },
        objective: { count: 3, votedByMe: false, ownCount: 0 },
      },
    }),
    vote: {
      displayMode: "voting",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 1 },
      canVote: true,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const VotePreview: Story = {
  args: {
    vote: {
      displayMode: "voting",
      selectedKind: "subjective",
      voteRemaining: { subjective: 1, objective: 3 },
      canVote: true,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};

export const Decided: Story = {
  args: {
    isDecided: true,
  },
};

export const ExcludedForHost: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canExcludeNote: true,
    canRestoreNote: true,
    onExclude: fn(),
    onRestore: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId("note-card");
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });
    const restore = canvas.getByRole("button", { name: "候補に戻す" });

    await userEvent.hover(surface);
    await waitFor(() => expect(restore).toBeVisible());
    await userEvent.unhover(surface);
    surface.focus();
    await waitFor(() => expect(restore).toBeVisible());
    surface.blur();
    fireEvent.pointerUp(surface, { pointerId: 7, pointerType: "touch" });
    await waitFor(() => expect(restore).toBeVisible());
    await waitFor(() => expect(getComputedStyle(card).opacity).toBe("0.9"));
    await expect(canvas.getByText("候補外")).toBeVisible();
  },
};

export const CandidateContextMenu: Story = {
  args: {
    canExcludeNote: true,
    onExclude: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole("button", { name: "付箋" });

    fireEvent.contextMenu(surface);
    await expect(args.onExclude).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("menuitem", { name: "候補から外す" }),
    );
    await expect(args.onExclude).toHaveBeenCalledWith("note-1");
  },
};

export const ExcludedKeyboardMenu: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canRestoreNote: true,
    onRestore: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });
    surface.focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    const menuItem = canvas.getByRole("menuitem", { name: "候補に戻す" });
    await expect(menuItem).toHaveFocus();
    await expect(args.onRestore).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onRestore).toHaveBeenCalledWith("note-1");
  },
};

export const ExcludedForParticipant: Story = {
  args: {
    note: buildNote({ excluded: true }),
    canEditNote: false,
    canDeleteNote: false,
    canMoveNote: false,
    canExcludeNote: false,
    canRestoreNote: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId("note-card");
    const surface = canvas.getByRole("button", { name: "候補外の付箋" });

    fireEvent.pointerUp(surface, { pointerId: 8, pointerType: "touch" });

    await waitFor(() => expect(getComputedStyle(card).opacity).toBe("0.9"));
    await expect(canvas.getByText("候補外")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "候補に戻す" }),
    ).not.toBeInTheDocument();
  },
};

export const ResultStep: Story = {
  args: {
    isSelected: true,
    editingDisabled: true,
    vote: {
      displayMode: "result",
      selectedKind: null,
      voteRemaining: { subjective: 0, objective: 0 },
      canVote: false,
      pendingOperations: [],
      onVote: fn(),
      onVoteRemove: fn(),
    },
  },
};
