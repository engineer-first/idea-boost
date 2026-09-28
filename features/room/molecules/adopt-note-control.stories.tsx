import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AdoptNoteControl } from "./adopt-note-control";

const meta = {
  title: "Room/AdoptNoteControl",
  component: AdoptNoteControl,
  args: {
    phaseNumber: 1,
    isHost: true,
    isSelecting: false,
    decisionContent: null,
    disabled: false,
    onStartSelection: fn(),
    onCancelSelection: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-48 items-end justify-center bg-muted/30 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdoptNoteControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const SelectingQuestion: Story = {
  args: { phaseNumber: 2, isSelecting: true },
};
export const DecidedIdeaForHost: Story = {
  args: {
    phaseNumber: 3,
    decisionContent: "会議前に考えを匿名で共有できるアプリ",
  },
};
export const DecidedForParticipant: Story = {
  args: { isHost: false, decisionContent: "発言する人が偏ってしまう" },
};
