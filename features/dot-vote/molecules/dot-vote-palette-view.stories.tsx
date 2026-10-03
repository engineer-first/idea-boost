import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DotVotePaletteView } from "./dot-vote-palette-view";

const meta = {
  title: "DotVote/DotVotePaletteView",
  component: DotVotePaletteView,
  args: {
    voteRemaining: { subjective: 1, objective: 3 },
    pendingOperationCount: 0,
    feedback: null,
    disabled: false,
    selectedKind: null,
    isReturnDropTarget: false,
    onStickerSelect: fn(),
    onStickerDragStart: fn(),
  },
} satisfies Meta<typeof DotVotePaletteView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  args: {
    selectedKind: "subjective",
  },
};

export const Exhausted: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 0 },
  },
};

export const ReturningSticker: Story = {
  args: {
    isReturnDropTarget: true,
  },
};

export const Available: Story = {};

export const SubjectiveExhausted: Story = {
  args: { voteRemaining: { subjective: 0, objective: 3 } },
};

export const ObjectiveExhausted: Story = {
  args: { voteRemaining: { subjective: 1, objective: 0 } },
};

export const AllPending: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 0 },
    pendingOperationCount: 4,
  },
};

export const Rejected: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 1 },
    feedback: { state: "failed", message: "この付箋には投票できません。" },
  },
};

export const Disconnected: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 0 },
    pendingOperationCount: 4,
    disabled: true,
  },
};

export const OneVoteReturned: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 1 },
    feedback: { state: "confirmed", message: "投票を1票取り消しました。" },
  },
};
