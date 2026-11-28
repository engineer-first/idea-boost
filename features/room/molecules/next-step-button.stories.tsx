import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { NextStepButton } from "./next-step-button";

const meta = {
  title: "Room/NextStepButton",
  component: NextStepButton,
  args: {
    disabled: false,
    onPress: fn(),
    nextStepLabel: "1-2 共有",
  },
} satisfies Meta<typeof NextStepButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// いつでも押せる。押すと確認を挟まずに進行を求める（全員に予告が出る）。
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "次のステップへ" }),
    );
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

// 条件がそろった直後や、自分が「まって！」で止めた後は光らせて目を向ける。
export const Emphasized: Story = {
  args: { emphasized: true },
};

// 予告の間など、待つ理由を示せない場合は破線の枠だけで押せないことを示す。
export const Disabled: Story = {
  args: { disabled: true },
};

// 採用する付箋を確定するまで押せない。
export const WaitingDecision: Story = {
  args: {
    disabled: true,
    waiting: { kind: "decision" },
    nextStepLabel: "2-1 個人",
  },
};

// 自分の票が残っている間。
export const WaitingOwnVotes: Story = {
  args: {
    disabled: true,
    waiting: { kind: "votes" },
    nextStepLabel: "1-5 決定",
  },
};

// 自分は使い切り、ほかの人の投票を待つ間。
export const WaitingOthersVotes: Story = {
  args: {
    disabled: true,
    waiting: { kind: "votesOthers" },
    nextStepLabel: "1-5 決定",
  },
};

// 再接続中。
export const Reconnecting: Story = {
  args: { disabled: true, waiting: { kind: "connection" } },
};
