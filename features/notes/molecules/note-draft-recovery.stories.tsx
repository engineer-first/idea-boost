import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NoteDraftRecovery } from "./note-draft-recovery";

const meta = {
  title: "Notes/NoteDraftRecovery",
  component: NoteDraftRecovery,
} satisfies Meta<typeof NoteDraftRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Conflict: Story = {
  args: {
    items: [
      {
        noteId: "例の付箋",
        text: "消さずに残した文章です。",
        reason: "他の編集と競合しました。",
      },
    ],
  },
};

export const MultipleLongDrafts: Story = {
  args: {
    items: [
      {
        noteId: "中断した付箋",
        text: "接続が切れる前に考えていた文章です。\n".repeat(50),
        reason: "現在は編集できません。",
      },
      {
        noteId: "変換中の付箋",
        text: "かんじに変換していた未確定の文章",
        reason: "変換中に中断されました。",
      },
    ],
  },
};
