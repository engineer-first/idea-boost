import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { SignOutControl } from "./sign-out-control";

const meta = {
  title: "Auth/SignOutControl",
  component: SignOutControl,
  args: { sessionKind: "guest", signOutAction: fn() },
} satisfies Meta<typeof SignOutControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guest: Story = {};
export const Account: Story = { args: { sessionKind: "account" } };
