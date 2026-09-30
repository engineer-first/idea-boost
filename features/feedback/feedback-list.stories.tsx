import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FeedbackList } from "./feedback-list";

const meta = {
  title: "Feedback/FeedbackList",
  component: FeedbackList,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FeedbackList>;
export default meta;
type Story = StoryObj<typeof meta>;
// 通信の各状態はFeedbackListView storiesで確認し、このstoryは実際の取得経路を確認する。
export const Connected: Story = {};
