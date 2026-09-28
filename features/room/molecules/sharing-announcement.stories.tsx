import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildSharingState } from "@/contracts/room-protocol.fixture";
import { SharingAnnouncement } from "./sharing-announcement";

const meta = {
  title: "Room/SharingAnnouncement",
  component: SharingAnnouncement,
  args: { member: buildSharingState().order[0] },
  decorators: [
    (Story) => (
      <div className="relative h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SharingAnnouncement>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
