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

// 390px の実ボードで通知が重なったマイ付箋トリガーの位置を再現する。
export const BoardToolbarReachability: Story = {
  args: Conflict.args,
  render: (args) => (
    <>
      <button
        type="button"
        aria-label="マイ付箋を開く"
        className="fixed right-[113px] bottom-[133px] h-7 w-7 rounded border"
      >
        ＋
      </button>
      <NoteDraftRecovery {...args} />
    </>
  ),
};

export const SaveResultUnknown: Story = {
  args: {
    items: [
      {
        noteId: "保存確認中の付箋",
        text: "保存を送信しましたが、認証期限が切れて結果を確認できていない文章です。",
        reason: "保存結果を確認できていません。再認証後に結果を確認します。",
      },
    ],
  },
};
