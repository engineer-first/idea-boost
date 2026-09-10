import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
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

// 選択状態: 青い枠が付き、Backspace/Deleteで削除・もう一度クリックで編集に入れる。
export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

// 自分がドラッグ中: 「持ち上げた」表現として影が深くなる。
export const Dragging: Story = {
  args: {
    isSelected: true,
    isOwnDrag: true,
  },
};

// 共有付箋の作者色（黄色）は維持し、現在の移動者色（緑）を枠と名前に使う。
export const DraggedByAnotherMember: Story = {
  args: {
    note: buildNote({ color: "yellow" }),
    activeDragMember: {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Taro Yamada",
      color: "green",
    },
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
