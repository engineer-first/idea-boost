import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoomConnectionNoticeView } from "./room-connection-notice-view";

const meta = {
  title: "Room/RoomConnectionNoticeView",
  component: RoomConnectionNoticeView,
  args: {
    status: "auth-required",
    returnHref: "/rooms/11111111-1111-4111-8111-111111111111",
  },
} satisfies Meta<typeof RoomConnectionNoticeView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AuthRequired: Story = {};
