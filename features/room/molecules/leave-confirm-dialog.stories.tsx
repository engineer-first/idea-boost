import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
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

export const LastMember: Story = {
  args: { lastMember: true },
};

// 退出処理中（多重押下防止で操作が無効化される）。
export const Leaving: Story = {
  args: {
    mode: "leave",
    isLeaving: true,
  },
};
