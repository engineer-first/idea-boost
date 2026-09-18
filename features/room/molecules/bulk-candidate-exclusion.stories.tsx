import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { BulkCandidateExclusion } from "./bulk-candidate-exclusion";

const meta = {
  title: "Room/BulkCandidateExclusion",
  component: BulkCandidateExclusion,
  args: { targetCount: 3, disabled: false, onConfirm: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-48 items-end justify-center bg-muted/30 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BulkCandidateExclusion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTargets: Story = {};
export const Empty: Story = { args: { targetCount: 0 } };
export const Confirming: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "投票なしをまとめて候補から外す（3件）",
      }),
    );
  },
};
