import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { LeaveConfirmDialog } from "./leave-confirm-dialog";

const meta = {
  title: "Room/LeaveConfirmDialog",
  component: LeaveConfirmDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    isLeaving: false,
  },
} satisfies Meta<typeof LeaveConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// 参加者の退出確認（既定モード）。
export const Leave: Story = {
  args: {
    mode: "leave",
  },
};

export const CompletedLeave: Story = {
  args: {
    mode: "leave",
    completed: true,
  },
};

// ホストの解散確認（ルーム削除の警告文言になる）。
export const Disband: Story = {
  args: {
    mode: "disband",
  },
};

// 退出処理中（多重押下防止で操作が無効化される）。
export const Leaving: Story = {
  args: {
    mode: "leave",
    isLeaving: true,
  },
};

export const Discard: Story = {
  args: { mode: "leave" },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      dialog.getByRole("radio", { name: "成果を残さず退出" }),
    );
  },
};

export const CompletedDiscard: Story = {
  ...Discard,
  args: { mode: "leave", completed: true },
};
