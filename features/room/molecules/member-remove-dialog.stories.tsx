import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { MemberRemoveDialog } from "./member-remove-dialog";

const meta = {
  title: "Room/MemberRemoveDialog",
  component: MemberRemoveDialog,
  args: {
    open: true,
    target: {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Hana Sato",
      color: "blue",
    },
    pending: false,
    error: null,
    disconnected: false,
    blocked: false,
    onConfirm: fn(),
    onOpenChange: fn(),
  },
  parameters: { chromatic: { viewports: [390, 1280] } },
} satisfies Meta<typeof MemberRemoveDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Confirm: Story = {};
export const Pending: Story = { args: { pending: true } };
export const Failed: Story = {
  args: {
    error:
      "結果を確認できませんでした。参加者一覧を確認してから操作し直してください。",
  },
};
export const Disconnected: Story = { args: { disconnected: true } };
export const Departed: Story = { args: { target: null } };
export const Blocked: Story = { args: { blocked: true } };
export const LongName: Story = {
  args: {
    target: {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "長い名前でも対象を確認できる参加者の表示名".repeat(5),
      color: "blue",
    },
  },
};
