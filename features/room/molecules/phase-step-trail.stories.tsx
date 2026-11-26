import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseStepTrail } from "./phase-step-trail";

const meta = {
  title: "Room/PhaseStepTrail",
  component: PhaseStepTrail,
  args: { phase: buildPhaseStep(2, 1) },
} satisfies Meta<typeof PhaseStepTrail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstStep: Story = { args: { phase: buildPhaseStep(1, 1) } };
export const MiddleStep: Story = {};
export const QuestionPhase: Story = { args: { phase: buildPhaseStep(3, 2) } };
export const LongStepName: Story = { args: { phase: buildPhaseStep(3, 3) } };
export const LastStep: Story = { args: { phase: buildPhaseStep(5, 3) } };
