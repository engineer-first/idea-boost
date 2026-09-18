import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildDemoStatus } from "@/contracts/demo.fixture";
import { DemoPanelView } from "./demo-panel-view";

const meta = {
  title: "Demo/DemoPanelView",
  component: DemoPanelView,
  args: {
    expanded: true,
    status: buildDemoStatus(),
    checkpoint: "share",
    pending: false,
    error: null,
    onToggle: fn(),
    onAction: fn(),
    onCheckpointChange: fn(),
    onCreate: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof DemoPanelView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Share: Story = {};
export const Collapsed: Story = { args: { expanded: false } };
export const Loading: Story = { args: { status: null } };
export const Pending: Story = { args: { pending: true } };
export const Failure: Story = {
  args: { error: "デモの通信に失敗しました。状況を再取得してください。" },
};
export const Vote: Story = {
  args: {
    status: buildDemoStatus({
      phase: { kind: "step", phase: 1, step: 4 },
      availableActions: ["vote"],
      sharedCount: 4,
    }),
  },
};
export const Complete: Story = {
  args: {
    status: buildDemoStatus({
      checkpoint: "complete",
      phase: { kind: "step", phase: 3, step: 5 },
      availableActions: [],
      sharedCount: 4,
      votedCount: 4,
    }),
  },
};
export const Grouping: Story = {
  args: {
    checkpoint: "grouping",
    status: buildDemoStatus({
      checkpoint: "grouping",
      phase: { kind: "step", phase: 1, step: 3 },
      availableActions: ["group"],
      sharedCount: 4,
    }),
  },
};
export const HmwWriting: Story = {
  args: {
    checkpoint: "hmw",
    status: buildDemoStatus({
      checkpoint: "hmw",
      phase: { kind: "step", phase: 2, step: 1 },
      availableActions: [],
    }),
  },
};
export const IdeaWriting: Story = {
  args: {
    checkpoint: "ideation",
    status: buildDemoStatus({
      checkpoint: "ideation",
      phase: { kind: "step", phase: 3, step: 1 },
      availableActions: [],
    }),
  },
};
