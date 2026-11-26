import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardFlowSteps } from "./board-flow-steps";

const meta = {
  title: "Room/BoardFlowSteps",
  component: BoardFlowSteps,
  args: { phase: buildPhaseStep(3, 2) },
  decorators: [
    (Story) => (
      <div className="w-[360px] rounded-xl border border-border bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BoardFlowSteps>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MiddleOfQuestionPhase: Story = {};
export const FirstStep: Story = { args: { phase: buildPhaseStep(1, 1) } };
export const LastStep: Story = { args: { phase: buildPhaseStep(5, 3) } };
