import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { VoteCountBadge } from "./vote-count-badge";

const meta = {
  title: "VoteTotaling/VoteCountBadge",
  component: VoteCountBadge,
  args: { label: "主観", value: 2, tone: "subjective" },
} satisfies Meta<typeof VoteCountBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Subjective: Story = {};
export const Objective: Story = {
  args: { label: "客観", value: 5, tone: "objective" },
};
