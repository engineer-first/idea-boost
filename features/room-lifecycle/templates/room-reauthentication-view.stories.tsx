import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RoomReauthenticationView } from "./room-reauthentication-view";

const meta = {
  title: "RoomLifecycle/RoomReauthentication",
  component: RoomReauthenticationView,
  args: { onContinue: fn(), onBack: fn() },
} satisfies Meta<typeof RoomReauthenticationView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Pending: Story = { args: { pending: true } };
export const StorageUnavailable: Story = {
  args: {
    message:
      "文章を確認・コピーしてから、ブラウザの保存設定を確認してください。",
  },
};
