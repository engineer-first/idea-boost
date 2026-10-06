import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoomConnectionNotice } from "./room-connection-notice";

const meta = {
  title: "Room/RoomConnectionNotice",
  component: RoomConnectionNotice,
  args: {
    status: "closed",
    delayed: false,
    className: "rounded-xl border border-border bg-background p-4 text-sm",
  },
} satisfies Meta<typeof RoomConnectionNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reconnecting: Story = {};
export const Waiting: Story = { args: { delayed: true } };
export const Synchronizing: Story = {
  args: { status: "connecting", delayed: true },
};
export const Connected: Story = { args: { status: "open" } };

export const AuthRequired: Story = { args: { status: "auth-required" } };
export const Unavailable: Story = { args: { status: "unavailable" } };
