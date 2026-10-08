import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
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
  args: { phase: buildPhaseStep(1, 2), onOpenFeedback: fn() },
} satisfies Meta<typeof BoardLocation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Compact: Story = {};
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /現在地/ }),
    );
  },
};
export const Steps: Story = {
  play: async (context) => {
    await Overview.play?.(context);
    await userEvent.click(
      within(context.canvasElement).getByRole("button", {
        name: "全手順を見る",
      }),
    );
  },
};
export const LongStepName: Story = {
  ...Overview,
  args: { phase: buildPhaseStep(3, 3) },
};
export const Waiting: Story = { args: { phase: { kind: "lobby" } } };
