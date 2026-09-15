import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { HmwTemplatePanel } from "./hmw-template-panel";

const meta = {
  title: "Hmw/HmwTemplatePanel",
  component: HmwTemplatePanel,
  args: {
    onTemplateSelect: fn(),
  },
} satisfies Meta<typeof HmwTemplatePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
