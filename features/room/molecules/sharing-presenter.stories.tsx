import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingPresenter } from "./sharing-presenter";

const meta = {
  title: "Room/SharingPresenter",
  component: SharingPresenter,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    sharing: buildSharingState(),
    hostUserId: "11111111-1111-4111-8111-111111111111",
  },
} satisfies Meta<typeof SharingPresenter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const OrderOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "発表者と全体の順番を確認",
      }),
    );
  },
};
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

export const Starting: Story = {
  args: {
    sharing: buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
      startsAt: 2_000,
    }),
  },
};
