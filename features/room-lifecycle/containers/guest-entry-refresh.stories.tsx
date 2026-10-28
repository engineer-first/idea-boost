import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { GuestEntryRefresh } from "./guest-entry-refresh";

const meta = {
  title: "RoomLifecycle/GuestEntryRefresh",
  component: GuestEntryRefresh,
  args: {
    roomId: "11111111-1111-4111-8111-111111111111",
    onRefreshed: fn(),
    refreshAction: () => new Promise(() => {}),
  },
} satisfies Meta<typeof GuestEntryRefresh>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Checking: Story = {};
export const Retry: Story = {
  args: { refreshAction: async () => ({ ok: false, reason: "retry" }) },
};
export const IdentityUnavailable: Story = {
  args: {
    refreshAction: async () => ({ ok: false, reason: "identity_unavailable" }),
  },
};
export const ReauthenticationRequired: Story = {
  args: {
    refreshAction: async () => ({ ok: false, reason: "reauth_required" }),
  },
};
