import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PreviewView } from "./preview-view";

const meta = {
  title: "Preview/PreviewView",
  component: PreviewView,
  parameters: { layout: "fullscreen" },
  args: { pending: false, error: null, onCreate: () => {} },
} satisfies Meta<typeof PreviewView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Choose: Story = {};
export const Preparing: Story = { args: { pending: true } };
export const Failed: Story = {
  args: {
    error: "準備に失敗しました。接続を確認して、ステップを選び直してください。",
  },
};
