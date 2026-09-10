import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DotVotePalette } from "./dot-vote-palette";

const meta = {
  title: "DotVote/DotVotePalette",
  component: DotVotePalette,
  args: {
    voteRemaining: { subjective: 1, objective: 3 },
    pendingOperationCount: 0,
    feedback: null,
    disabled: false,
    selectedKind: null,
    onStickerSelect: fn(),
    onStickerDragStart: fn(),
  },
} satisfies Meta<typeof DotVotePalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Selected: Story = {
  args: {
    selectedKind: "subjective",
  },
};

export const Pending: Story = {
  args: {
    pendingOperationCount: 1,
  },
};

export const Failed: Story = {
  args: {
    feedback: {
      state: "failed",
      message: "投票上限を超えています。",
    },
  },
};
