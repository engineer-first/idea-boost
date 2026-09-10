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
    onStickerDragStart: fn(),
  },
} satisfies Meta<typeof DotVotePaletteView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const Exhausted: Story = {
  args: {
    voteRemaining: { subjective: 0, objective: 0 },
  },
};
