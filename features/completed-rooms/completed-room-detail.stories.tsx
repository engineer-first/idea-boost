import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedRoomDetail } from "./completed-room-detail";

const meta = {
  title: "CompletedRooms/DetailContainer",
  component: CompletedRoomDetail,
  args: { roomId: completedRoomFixture().roomId },
} satisfies Meta<typeof CompletedRoomDetail>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
