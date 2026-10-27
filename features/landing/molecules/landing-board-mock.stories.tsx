import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingBoardMock } from "./landing-board-mock";

const meta = {
  title: "Landing/LandingBoardMock",
  component: LandingBoardMock,
  args: { variant: "hero" },
} satisfies Meta<typeof LandingBoardMock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hero: Story = {};
export const Issue: Story = { args: { variant: "issue" } };
export const Private: Story = { args: { variant: "private" } };
export const Vote: Story = { args: { variant: "vote" } };
