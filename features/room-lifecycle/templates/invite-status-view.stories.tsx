import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InviteStatusView } from "./invite-status-view";

const meta = {
  title: "RoomLifecycle/InviteStatusView",
  component: InviteStatusView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: { kind: "invalid" },
} satisfies Meta<typeof InviteStatusView>;

export default meta;
type Story = StoryObj<typeof InviteStatusView>;

export const Invalid: Story = { args: { kind: "invalid" } };
export const NotFound: Story = { args: { kind: "not_found" } };
export const Ended: Story = { args: { kind: "ended" } };
export const Unavailable: Story = {
  args: { kind: "unavailable", retryHref: "/invite/ABC234" },
};
