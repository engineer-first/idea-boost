import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DisplayNameDialog } from "./display-name-dialog";

const meta = {
  title: "Auth/DisplayNameDialog",
  component: DisplayNameDialog,
  args: {
    controls: {
      open: true,
      draft: "はな",
      pending: false,
      loading: false,
      error: null,
      request: fn(),
      onDraftChange: fn(),
      onConfirm: fn(),
      onOpenChange: fn(),
      onRetry: fn(),
    },
  },
} satisfies Meta<typeof DisplayNameDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
export const GoogleProfile: Story = {
  args: { controls: { ...meta.args.controls, draft: "山田 太郎" } },
};
export const Loading: Story = {
  args: { controls: { ...meta.args.controls, draft: "", loading: true } },
};
export const Saving: Story = {
  args: { controls: { ...meta.args.controls, pending: true } },
};
export const Failed: Story = {
  args: {
    controls: {
      ...meta.args.controls,
      error: "保存結果を確認できませんでした。もう一度保存してください。",
    },
  },
};

export const AtLimit: Story = {
  args: { controls: { ...meta.args.controls, draft: "あ".repeat(15) } },
};
