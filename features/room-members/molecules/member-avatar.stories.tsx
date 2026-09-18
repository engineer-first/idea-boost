import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TooltipProvider } from "@/components/ui/tooltip";
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
