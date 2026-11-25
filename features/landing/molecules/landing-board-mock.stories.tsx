import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingBoardMock } from "./landing-board-mock";

const meta = {
  title: "Landing/LandingBoardMock",
  component: LandingBoardMock,
} satisfies Meta<typeof LandingBoardMock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hero: Story = {};
