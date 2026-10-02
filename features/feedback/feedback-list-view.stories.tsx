import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildFeedback } from "@/contracts/feedback.fixture";
import { FeedbackListView } from "./feedback-list-view";

const meta = {
  title: "Feedback/FeedbackListView",
  component: FeedbackListView,
  parameters: { layout: "fullscreen" },
  args: {
    items: [
      buildFeedback(),
      buildFeedback({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        body: "",
        rating: null,
      }),
    ],
    filters: { kind: "", target: "", from: "", to: "" },
    loading: false,
    error: null,
    nextCursor: "next",
    canReadOutcomes: true,
    onFilter: fn(),
    onRefresh: fn(),
    onRetry: fn(),
    onMore: fn(),
  },
} satisfies Meta<typeof FeedbackListView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const List: Story = {};
export const Unclear: Story = {
  args: {
    items: [
      buildFeedback({
        kind: "unclear",
        target: "1-3",
        body: "何を基準に投票するかわからない",
        rating: null,
      }),
    ],
    filters: { kind: "unclear", target: "", from: "", to: "" },
    nextCursor: null,
  },
};
export const LongBody: Story = {
  args: {
    items: [
      buildFeedback({ body: "長い意見の全文を確認できます。".repeat(100) }),
    ],
  },
};
export const Empty: Story = { args: { items: [], nextCursor: null } };
export const Loading: Story = {
  args: { items: [], loading: true, nextCursor: null },
};
export const Unavailable: Story = {
  args: { items: [], error: "意見の閲覧権限がありません。", nextCursor: null },
};

export const ContinuationError: Story = {
  args: {
    error: "意見を取得できませんでした。再試行してください。",
    canReadOutcomes: false,
  },
};
export const FetchError: Story = {
  args: {
    items: [],
    error: "意見を取得できませんでした。再試行してください。",
    nextCursor: null,
  },
};
