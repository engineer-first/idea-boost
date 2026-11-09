import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppHeader } from "./app-header";

const meta = {
  title: "App/AppHeader",
  component: AppHeader,
  parameters: { nextjs: { navigation: { pathname: "/home" } } },
  args: { userName: "はな" },
} satisfies Meta<typeof AppHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavedName: Story = {};
export const Unset: Story = { args: { userName: "" } };
export const LongName: Story = { args: { userName: "あ".repeat(40) } };
export const Lobby: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start",
      },
    },
  },
};

export const Guest: Story = { args: { sessionKind: "guest" } };

export const Account: Story = { args: { sessionKind: "account" } };
export const AboutGuest: Story = {
  args: { sessionKind: "guest" },
  parameters: { nextjs: { navigation: { pathname: "/about" } } },
};
export const InviteAccount: Story = {
  args: { sessionKind: "account" },
  parameters: { nextjs: { navigation: { pathname: "/invite/ABC123" } } },
};
