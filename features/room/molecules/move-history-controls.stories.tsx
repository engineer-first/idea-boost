import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { MoveHistoryControls } from "./move-history-controls";

const meta = {
  title: "Room/MoveHistoryControls",
  component: MoveHistoryControls,
  args: {
    undo: {
      label: "2枚の付箋の移動（note-a, note-b）",
      reason: null,
      disabled: false,
    },
    redo: {
      label: "やり直せる移動はありません",
      reason: "やり直せる移動はありません",
      disabled: true,
    },
    pending: false,
    onUndo: fn(),
    onRedo: fn(),
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MoveHistoryControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Available: Story = {};
export const Empty: Story = {
  args: {
    undo: {
      label: "戻せる移動はありません",
      reason: "戻せる移動はありません",
      disabled: true,
    },
  },
};
export const Pending: Story = { args: { pending: true } };
export const Conflict: Story = {
  args: {
    undo: {
      label: "2枚の付箋の移動（note-a, note-b）",
      reason: "対象の付箋が変更されました。新しく移動してからお試しください。",
      disabled: true,
    },
  },
};
export const Disconnected: Story = {
  args: {
    undo: {
      label: "2枚の付箋の移動（note-a, note-b）",
      reason: "再接続するまで移動を戻せません",
      disabled: true,
    },
    redo: {
      label: "やり直す移動",
      reason: "再接続するまで移動を戻せません",
      disabled: true,
    },
  },
};
