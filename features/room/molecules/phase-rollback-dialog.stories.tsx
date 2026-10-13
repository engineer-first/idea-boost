import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseRollbackDialog } from "./phase-rollback-dialog";

const meta = {
  title: "Room/PhaseRollbackDialog",
  component: PhaseRollbackDialog,
  args: {
    phase: buildPhaseStep(1, 2),
    target: buildPhaseStep(5, 1),
    disabled: false,
    onConfirm: fn(),
  },
} satisfies Meta<typeof PhaseRollbackDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Destination: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "直前のステップに戻る",
      }),
    );
  },
};
export const FinalConfirmation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "直前のステップに戻る",
      }),
    );
    await userEvent.click(
      within(document.body).getByRole("button", { name: "1-5へ戻る" }),
    );
  },
};
export const SamePhase: Story = {
  ...Destination,
  args: { phase: buildPhaseStep(4, 3), target: buildPhaseStep(3, 3) },
};
