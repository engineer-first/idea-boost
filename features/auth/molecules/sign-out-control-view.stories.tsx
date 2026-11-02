import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { SignOutControlView } from "./sign-out-control-view";

const meta = {
  title: "Auth/SignOutControlView",
  component: SignOutControlView,
  args: {
    sessionKind: "guest",
    confirming: false,
    onConfirmingChange: fn(),
    onSignOut: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof SignOutControlView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guest: Story = {};
export const ConfirmRemoval: Story = { args: { confirming: true } };
export const Account: Story = { args: { sessionKind: "account" } };
