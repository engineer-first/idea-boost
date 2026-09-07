import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FacilitationGuide } from "./facilitation-guide";

const meta = {
  title: "Room/FacilitationGuide",
  component: FacilitationGuide,
  args: {
    id: "storybook-facilitation-guide",
    guide: {
      durationMinutes: 3,
      message:
        "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      hostMessage: "タイマーが終了したら、次のステップへ進んでください。",
    },
    isHost: true,
    isExpanded: true,
  },
  decorators: [
    (Story) => (
      <div className="w-[640px] rounded-xl border border-border bg-background/90 shadow-xl backdrop-blur-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FacilitationGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = {};

export const Participant: Story = {
  args: { isHost: false },
};

export const Collapsed: Story = {
  args: { isExpanded: false },
};
