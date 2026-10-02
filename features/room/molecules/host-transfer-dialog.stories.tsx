import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { HostTransferDialog } from "./host-transfer-dialog";

const meta = {
  title: "Room/HostTransferDialog",
  component: HostTransferDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    pending: false,
    disconnected: false,
    error: null,
    currentUserId: "11111111-1111-4111-8111-111111111111",
    members: [
      {
        userId: "22222222-2222-4222-8222-222222222222",
        name: "次の進行役",
        color: "blue",
      },
    ],
  },
} satisfies Meta<typeof HostTransferDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectMember: Story = {};
export const Empty: Story = { args: { members: [] } };
export const Pending: Story = { args: { pending: true } };
export const Disconnected: Story = { args: { disconnected: true } };
export const Failed: Story = {
  args: { error: "相手が切断しました。接続中のメンバーを選び直してください。" },
};
