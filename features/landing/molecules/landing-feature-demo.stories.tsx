import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingFeatureDemo } from "./landing-feature-demo";

const meta = {
  title: "Landing/LandingFeatureDemo",
  component: LandingFeatureDemo,
  args: { index: 0 },
} satisfies Meta<typeof LandingFeatureDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invite: Story = {};
export const Timer: Story = { args: { index: 1 } };
export const Private: Story = { args: { index: 2 } };
export const Votes: Story = { args: { index: 3 } };
export const Hint: Story = { args: { index: 4 } };
export const Save: Story = { args: { index: 5 } };
