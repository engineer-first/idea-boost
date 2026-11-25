import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseLoopControls } from "./phase-loop-controls";

const meta = {
  title: "Room/PhaseLoopControls",
  component: PhaseLoopControls,
  args: {
    phase: buildPhaseStep(5),

    isSelecting: false,
    decisionContent: null,
    candidateCount: 3,
    disabled: false,
    onRevote: fn(),
    onStartSelection: fn(),
    onCancelSelection: fn(),
    onClearDecision: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-64 items-end justify-center bg-muted/30 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhaseLoopControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Result: Story = {};
export const NoCandidates: Story = {
  args: { phase: buildPhaseStep(5), candidateCount: 0 },
};
export const OneCandidate: Story = {
  args: { phase: buildPhaseStep(4, 2), candidateCount: 1 },
};
export const Selecting: Story = {
  args: { phase: buildPhaseStep(5, 3), isSelecting: true },
};
export const Member: Story = {
  args: { phase: buildPhaseStep(5) },
};
export const Disconnected: Story = { args: { disabled: true } };
export const Decided: Story = {
  args: {
    phase: buildPhaseStep(5),
    decisionContent: "初参加の人が発言しやすい場を作る",
  },
};
