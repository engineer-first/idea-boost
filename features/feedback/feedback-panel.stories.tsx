import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { buildFeedbackControls } from "./feedback.fixture";
import { FeedbackPanel } from "./feedback-panel";
import { useFeedback } from "./use-feedback";

const meta = {
  title: "Feedback/FeedbackPanel",
  component: FeedbackPanel,
  parameters: { layout: "fullscreen" },
  args: { feedback: buildFeedbackControls() },
} satisfies Meta<typeof FeedbackPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AppRating: Story = {};
export const Step: Story = {
  args: {
    feedback: buildFeedbackControls({
      draft: { target: "1-3", kind: "", body: "", rating: null },
    }),
  },
};
export const Pending: Story = {
  args: { feedback: buildFeedbackControls({ pending: true }) },
};
export const Unavailable: Story = {
  args: {
    feedback: buildFeedbackControls({
      error: "送信できませんでした。入力は残っています。再送してください。",
    }),
  },
};
export const ExpiredReceipt: Story = {
  args: {
    feedback: buildFeedbackControls({
      error:
        "この受付IDでは送信できません。端末の日時を確認し、下のボタンで新しい意見として送信してください。",
      retryWithNewId: true,
    }),
  },
};
export const Success: Story = {
  args: {
    feedback: buildFeedbackControls({
      receipt: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
  },
};
export const Interactive: Story = {
  render: function Render() {
    const feedback = useFeedback(
      "storybook-feedback",
      async (_room, input) => ({ ok: true, id: input.id }),
    );
    const open = feedback.open;
    useEffect(() => open("app"), [open]);
    return (
      <>
        <button type="button" onClick={() => open("app")}>
          意見を送る
        </button>
        <FeedbackPanel feedback={feedback} />
      </>
    );
  },
};

export const DelayedSubmission: Story = {
  render: function Render() {
    const feedback = useFeedback(
      "storybook-delayed-feedback",
      async (_room, input) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { ok: true, id: input.id };
      },
    );
    return (
      <>
        <button type="button" onClick={() => feedback.open("app")}>
          意見を送る
        </button>
        <button type="button">作業に戻る</button>
        <FeedbackPanel feedback={feedback} />
      </>
    );
  },
};
