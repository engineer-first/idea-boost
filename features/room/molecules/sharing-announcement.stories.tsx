import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingAnnouncement } from "./sharing-announcement";

const meta = {
  title: "Room/SharingAnnouncement",
  component: SharingAnnouncement,
  args: { member: buildSharingState().order[0] },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="relative h-[600px]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SharingAnnouncement>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Self: Story = { args: { isSelf: true } };
/** 聞く人から見て発表者の接続が切れているとき。その場でパスできる（#1431）。 */
export const PresenterDisconnected: Story = {
  args: { isDisconnected: true, onPass: () => {} },
};
/** 接続切れの発表者を「パスする」と、次の人の番に移る。押した後のフォーカスを確かめる（#1453）。 */
export const PresenterDisconnectedPassed: Story = {
  render: function Render() {
    const [first, second] = buildSharingState().order;
    const [passed, setPassed] = useState(false);
    return (
      <SharingAnnouncement
        member={passed ? second : first}
        isDisconnected={!passed}
        onPass={() => setPassed(true)}
      />
    );
  },
};
