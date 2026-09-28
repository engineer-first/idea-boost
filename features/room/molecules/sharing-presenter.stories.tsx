import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingPresenter } from "./sharing-presenter";

const meta = {
  title: "Room/SharingPresenter",
  component: SharingPresenter,
  args: {
    sharing: buildSharingState(),
    hostUserId: "11111111-1111-4111-8111-111111111111",
  },
} satisfies Meta<typeof SharingPresenter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Active: Story = {
  args: {
    sharing: buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
    }),
  },
};
export const Complete: Story = {
  args: {
    sharing: buildSharingState({
      status: "complete",
      results: ["done", "passed", "done"],
    }),
  },
};
