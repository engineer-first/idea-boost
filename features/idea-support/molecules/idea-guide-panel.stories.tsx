import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { IdeaGuidePanel } from "./idea-guide-panel";

const meta = {
  title: "IdeaSupport/IdeaGuidePanel",
  component: IdeaGuidePanel,
  parameters: { chromatic: { viewports: [390, 1280] } },
  args: {
    onHintSelect: fn(),
  },
} satisfies Meta<typeof IdeaGuidePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const MoreExamples: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "ほかの考え方を見る" }),
    );
  },
};
