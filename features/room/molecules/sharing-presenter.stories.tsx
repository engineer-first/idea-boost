import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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

// 順番メニューの発表中の行にパスを出す。切断中の発表者は確認なしでパスする。
export const PassAwayPresenter: Story = {
  args: {
    sharing: buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
    }),
    currentUserId: "11111111-1111-4111-8111-111111111111",
    connectedUserIds: ["11111111-1111-4111-8111-111111111111"],
    onPassPresenter: () => {},
    onSelectMember: () => {},
  },
};
