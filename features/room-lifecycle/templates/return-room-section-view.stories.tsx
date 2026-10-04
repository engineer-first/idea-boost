import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ReturnRoomSectionView } from "./return-room-section-view";

const meta = {
  title: "RoomLifecycle/ReturnRoomSectionView",
  component: ReturnRoomSectionView,
  args: { status: "idle", onConfirm: fn() },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReturnRoomSectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Available: Story = {};
export const Checking: Story = { args: { status: "checking" } };
export const TemporaryFailure: Story = { args: { status: "retry" } };
export const Unavailable: Story = { args: { status: "unavailable" } };
