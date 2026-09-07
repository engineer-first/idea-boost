import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IdeaValueFeasibilityMap } from "./idea-value-feasibility-map";

const meta = {
  title: "Room/IdeaValueFeasibilityMap",
  component: IdeaValueFeasibilityMap,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="relative h-[760px] overflow-hidden bg-muted/20 [container-type:size]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaValueFeasibilityMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
