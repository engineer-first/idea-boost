import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildCarryover } from "@/contracts/room-protocol.fixture";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { BoardContext } from "./board-context";

const phase = buildPhaseStep(1, 3);
const meta = {
  title: "Room/BoardContext",
  component: BoardContext,
  render: function Render(args) {
    const [isExpanded, setExpanded] = useState(args.isExpanded);
    return (
      <div className="w-full max-w-[360px]">
        <BoardContext
          {...args}
          isExpanded={isExpanded}
          onExpandedChange={setExpanded}
        />
      </div>
    );
  },
  args: {
    phase,
    guide: getFacilitationGuide(phase),
    isHost: true,
    isExpanded: true,
    onExpandedChange: fn(),
    hmwDecidedIssue: buildCarryover().content,
    decidedHmw: buildCarryover({
      phase: 2,
      content: "どうすれば全員が安心してアイデアを共有できるだろうか？",
    }).content,
  },
} satisfies Meta<typeof BoardContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guide: Story = {};
export const Decisions: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("決定した課題"));
  },
};
export const Collapsed: Story = { args: { isExpanded: false } };
export const NoDecisions: Story = {
  args: { hmwDecidedIssue: null, decidedHmw: null },
};
export const Participant: Story = { args: { isHost: false } };

export const HmwWriting: Story = {
  args: {
    phase: buildPhaseStep(1, 2),
    guide: getFacilitationGuide(buildPhaseStep(1, 2)),
    decidedHmw: null,
  },
};
export const AfterWriting: Story = {
  args: {
    phase: buildPhaseStep(2, 3),
    guide: getFacilitationGuide(buildPhaseStep(2, 3)),
  },
};
