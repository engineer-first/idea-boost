import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { GuestEntryRefreshView } from "./guest-entry-refresh-view";

const meta = {
  title: "RoomLifecycle/GuestEntryRefreshView",
  component: GuestEntryRefreshView,
  args: {
    state: "checking",
    onRetry: fn(),
  },
} satisfies Meta<typeof GuestEntryRefreshView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Checking: Story = {};
export const Retry: Story = { args: { state: "retry" } };
export const IdentityUnavailable: Story = {
  args: { state: "identity_unavailable" },
};
