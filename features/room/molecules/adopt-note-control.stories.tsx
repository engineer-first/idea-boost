import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { AdoptNoteControl } from "./adopt-note-control";

const meta = {
  title: "Room/AdoptNoteControl",
  component: AdoptNoteControl,
  args: {
    phaseNumber: 1,

    isSelecting: false,
    decisionContent: null,
    disabled: false,
    onStartSelection: fn(),
    onCancelSelection: fn(),
    onClearDecision: fn(),
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
// 決定ステップの既定。選択中の帯に再投票を並べる。
export const SelectingWithRevote: Story = {
  args: {
    isSelecting: true,
    selectingActions: (
      <Button type="button" variant="outline" className="h-10 px-3 text-sm">
        もう一度投票する
      </Button>
    ),
  },
};
// スマホ縦の幅では、文言の行とボタンの行に折り返す。
export const SelectingWithRevoteNarrow: Story = {
  args: SelectingWithRevote.args,
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
};
export const DecidedIdeaForHost: Story = {
  args: {
    phaseNumber: 3,
    decisionContent: "会議前に考えを匿名で共有できるアプリ",
  },
};
export const DecidedForParticipant: Story = {
  args: { decisionContent: "発言する人が偏ってしまう" },
};
