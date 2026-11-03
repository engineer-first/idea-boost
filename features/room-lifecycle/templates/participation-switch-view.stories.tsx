import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ParticipationSwitchView } from "./participation-switch-view";

const meta = {
  title: "RoomLifecycle/ParticipationSwitch",
  component: ParticipationSwitchView,
  args: { pending: true, onRetry: () => {} },
} satisfies Meta<typeof ParticipationSwitchView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const ConnectionFailure: Story = {
  args: {
    pending: false,
  },
};
export const TerminalFailure: Story = {
  args: { pending: false, terminal: true },
};
