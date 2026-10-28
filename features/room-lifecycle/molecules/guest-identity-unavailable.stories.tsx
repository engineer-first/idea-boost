import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuestIdentityUnavailable } from "./guest-identity-unavailable";

const meta = {
  title: "RoomLifecycle/GuestIdentityUnavailable",
  component: GuestIdentityUnavailable,
  args: { returnHref: "/rooms/11111111-1111-4111-8111-111111111111" },
} satisfies Meta<typeof GuestIdentityUnavailable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unavailable: Story = {};
