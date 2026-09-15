import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { IdeaGuidePanel } from "./idea-guide-panel";

const meta = {
  title: "IdeaSupport/IdeaGuidePanel",
  component: IdeaGuidePanel,
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
