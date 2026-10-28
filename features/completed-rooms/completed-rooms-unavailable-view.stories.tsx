import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CompletedRoomsUnavailableView } from "./completed-rooms-unavailable-view";

const meta = {
  title: "CompletedRooms/Unavailable",
  component: CompletedRoomsUnavailableView,
  parameters: { layout: "fullscreen" },
  args: { returnPath: "/completed-rooms" },
} satisfies Meta<typeof CompletedRoomsUnavailableView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const List: Story = {};
export const Detail: Story = {
  args: { returnPath: "/completed-rooms/11111111-1111-4111-8111-111111111111" },
};
