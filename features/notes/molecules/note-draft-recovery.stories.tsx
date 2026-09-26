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
