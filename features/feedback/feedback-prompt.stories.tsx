import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildFeedbackControls } from "./feedback.fixture";
import { FeedbackPrompt } from "./feedback-prompt";

const meta = {
  title: "Feedback/FeedbackPrompt",
  component: FeedbackPrompt,
  args: { feedback: buildFeedbackControls({ promptVisible: true }) },
} satisfies Meta<typeof FeedbackPrompt>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Visible: Story = {};
