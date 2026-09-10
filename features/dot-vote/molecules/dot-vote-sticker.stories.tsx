import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DotVoteSticker } from "./dot-vote-sticker";

const meta = {
  title: "DotVote/DotVoteSticker",
  component: DotVoteSticker,
  args: {
    kind: "objective",
    count: 2,
    state: "confirmed",
    onRemove: fn(),
  },
} satisfies Meta<typeof DotVoteSticker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mine: Story = {};

export const Preview: Story = {
  args: {
    kind: "subjective",
    count: 1,
    state: "preview",
    onRemove: undefined,
  },
};

export const Result: Story = {
  args: {
    count: 12,
    state: "result",
    onRemove: undefined,
  },
};
