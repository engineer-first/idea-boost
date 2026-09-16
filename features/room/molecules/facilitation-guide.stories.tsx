import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { FacilitationGuide } from "./facilitation-guide";

const VOTING_GUIDE = getFacilitationGuide(buildPhaseStep(4));

const meta = {
  title: "Room/FacilitationGuide",
  component: FacilitationGuide,
  args: {
    id: "storybook-facilitation-guide",
    guide: {
      durationMinutes: 3,
      message:
        "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      hostMessage:
        "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
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

export const VotingCriteria: Story = {
  args: {
    guide: VOTING_GUIDE ?? {
      durationMinutes: 3,
      message: "投票の案内を表示できません。",
      hostMessage: null,
    },
  },
};

export const Participant: Story = {
  args: { isHost: false },
};

export const Collapsed: Story = {
  args: { isExpanded: false },
};
