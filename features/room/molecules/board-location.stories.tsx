import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardLocation } from "./board-location";

const meta = {
  title: "Room/BoardLocation",
  component: BoardLocation,
  decorators: [
    (Story) => (
      <div className="w-full max-w-[360px]">
        <Story />
      </div>
    ),
  ],
  args: { phase: buildPhaseStep(1, 2) },
} satisfies Meta<typeof BoardLocation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Compact: Story = {};
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /現在地/ }),
    );
  },
};
export const OtherPhase: Story = {
  play: async (context) => {
    await Expanded.play?.(context);
    await userEvent.click(
      within(context.canvasElement).getByRole("tab", { name: /アイデア/ }),
    );
  },
};
export const LongStepName: Story = {
  ...Expanded,
  args: { phase: buildPhaseStep(3, 3) },
};
export const KeyboardScrollFocus: Story = {
  play: async (context) => {
    await Expanded.play?.(context);
    await userEvent.tab();
    await userEvent.tab();
  },
};
export const Waiting: Story = { args: { phase: { kind: "lobby" } } };

export const CompletedSteps: Story = {
  ...Expanded,
  args: { phase: buildPhaseStep(2, 2) },
};
export const CompletedPhase: Story = {
  args: { phase: buildPhaseStep(2, 2) },
  play: async (context) => {
    await Expanded.play?.(context);
    await userEvent.click(
      within(context.canvasElement).getByRole("tab", { name: /課題/ }),
    );
  },
};
