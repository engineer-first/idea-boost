import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { StepGuide } from "./step-guide";

const guide = getFacilitationGuide(buildPhaseStep(1));
if (!guide) throw new Error("工程ガイドが必要です");
const meta = {
  title: "Room/StepGuide",
  component: StepGuide,
  parameters: { layout: "fullscreen" },
  args: {
    guide,
    phaseKey: "1-1",
    sessionKey: "preview:me",
    isHost: false,
    isReady: true,
    initialState: "compact",
  },
  decorators: [
    (Story) => (
      <div className="relative h-screen bg-muted/20">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepGuide>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Compact: Story = {};
export const Intro: Story = { args: { initialState: "intro" } };
export const Detail: Story = { args: { initialState: "detail" } };
export const Host: Story = { args: { initialState: "detail", isHost: true } };
export const Loading: Story = { args: { isReady: false } };
export const Voting: Story = {
  args: {
    guide: getFacilitationGuide(buildPhaseStep(4)) ?? guide,
    initialState: "detail",
  },
};

export const Sharing: Story = {
  args: {
    guide: getFacilitationGuide(buildPhaseStep(2)) ?? guide,
    phaseKey: "1-2",
    initialState: "detail",
  },
};
export const Grouping: Story = {
  args: {
    guide: getFacilitationGuide(buildPhaseStep(3)) ?? guide,
    phaseKey: "1-3",
    initialState: "detail",
  },
};
export const Question: Story = {
  args: {
    guide: getFacilitationGuide(buildPhaseStep(1, 2)) ?? guide,
    phaseKey: "2-1",
    initialState: "detail",
  },
};
export const Comparing: Story = {
  args: {
    guide: getFacilitationGuide(buildPhaseStep(3, 3)) ?? guide,
    phaseKey: "3-3",
    initialState: "detail",
  },
};
export const SharingHost: Story = {
  args: { ...Sharing.args, isHost: true },
};
