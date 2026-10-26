import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingDemo } from "./landing-demo";

const meta = {
  title: "Landing/LandingDemo",
  component: LandingDemo,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LandingDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
