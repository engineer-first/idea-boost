import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  clearLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";
import { ReturnRoomSection } from "./return-room-section";

const meta = {
  title: "RoomLifecycle/ReturnRoomSection",
  component: ReturnRoomSection,
  args: { currentUserId: "11111111-1111-4111-8111-111111111111" },
} satisfies Meta<typeof ReturnRoomSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoCandidate: Story = { beforeEach: () => clearLastRoom() };
export const Available: Story = {
  beforeEach: () =>
    rememberLastRoom(
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ),
};
