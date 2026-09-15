import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DemoEntryView } from "./demo-entry-view";

const meta = {
  title: "Demo/DemoEntryView",
  component: DemoEntryView,
  args: {
    checkpoint: "start",
    pending: false,
    error: null,
    onCheckpointChange: fn(),
    onStart: fn(),
  },
} satisfies Meta<typeof DemoEntryView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Preparing: Story = { args: { pending: true } };
export const Failure: Story = {
  args: { error: "デモの通信に失敗しました。もう一度お試しください。" },
};
export const Vote: Story = { args: { checkpoint: "vote" } };
