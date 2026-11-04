import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MEMBER_AVATAR_IDS } from "@/contracts/member-avatar";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { MemberAvatar } from "./member-avatar";

const meta = {
  title: "RoomMembers/MemberAvatar",
  component: MemberAvatar,
  parameters: { layout: "centered" },
  args: {
    name: "Yuki Tanaka",
    color: "yellow",
    size: 36,
    isMe: false,
  },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <div style={{ padding: 24 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof MemberAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const You: Story = {
  args: { isMe: true },
};

export const VotingComplete: Story = {
  args: { isVotingComplete: true },
};

export const Empty: Story = {
  args: { name: "" },
};

export const SingleToken: Story = {
  args: { name: "Taro" },
};

export const Japanese: Story = {
  args: { name: "田中裕樹" },
};

export const Large: Story = {
  args: { size: 56 },
};

export const Small: Story = {
  args: { size: 24 },
};

export const AllFaces: Story = {
  name: "顔20種類と付箋20色",
  render: () => (
    <div className="grid grid-cols-5 gap-6 p-6">
      {MEMBER_AVATAR_IDS.map((avatarId, index) => (
        <div key={avatarId} className="flex flex-col items-center gap-2">
          <MemberAvatar
            name={`参加者${index + 1}`}
            avatarId={avatarId}
            color={NOTE_COLOR_PALETTE[index]}
            size={64}
          />
          <span className="text-xs">{avatarId}</span>
        </div>
      ))}
    </div>
  ),
};
export const DisconnectedWithCompletion: Story = {
  name: "切断中・完了表示あり",
  args: {
    name: "はな",
    avatarId: "face-07",
    color: "pink",
    isConnected: false,
    isVotingComplete: true,
  },
};
