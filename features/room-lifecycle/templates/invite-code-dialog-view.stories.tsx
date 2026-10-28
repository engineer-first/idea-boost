import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { InviteCodeDialogView } from "./invite-code-dialog-view";

const meta = {
  title: "RoomLifecycle/InviteCodeDialog",
  component: InviteCodeDialogView,
  parameters: { layout: "fullscreen" },
  args: {
    inviteCode: "ABC234",
    hostName: "田中太郎",
    open: true,
    pending: false,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof InviteCodeDialogView>;

export default meta;
type Story = StoryObj<typeof meta>;

// 招待コードとホスト名を提示し、参加確認を待つ状態。
export const Default: Story = {};

// 参加処理中（多重押下防止でボタンが無効・文言が「参加中…」）。
export const Joining: Story = {
  args: {
    pending: true,
  },
};

export const IdentityUnavailable: Story = {
  args: {
    message:
      "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。",
  },
};
