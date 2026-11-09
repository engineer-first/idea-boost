import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuestIdentityUnavailable } from "./guest-identity-unavailable";

const meta = {
  title: "RoomLifecycle/GuestIdentityUnavailable",
  component: GuestIdentityUnavailable,
} satisfies Meta<typeof GuestIdentityUnavailable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithLogin: Story = {
  args: {
    loginHref:
      "/login?next=%2Frooms%2F11111111-1111-4111-8111-111111111111%2Fstart%3Fentry%3Dtoken%26tab%3Dtab-id&guest_next=%2Fhome",
  },
};
export const SessionRemains: Story = {};
