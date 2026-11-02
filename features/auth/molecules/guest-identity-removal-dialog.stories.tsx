import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { GuestIdentityRemovalDialog } from "./guest-identity-removal-dialog";

const meta = {
  title: "Auth/GuestIdentityRemovalDialog",
  component: GuestIdentityRemovalDialog,
  args: { open: true, onOpenChange: fn(), onConfirm: fn() },
} satisfies Meta<typeof GuestIdentityRemovalDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConfirmRemoval: Story = {};
