import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccountLinkSectionView } from "./account-link-section-view";

const meta = {
  title: "Auth/AccountLinkSection",
  component: AccountLinkSectionView,
  args: { status: "guest", action: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AccountLinkSectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guest: Story = {};
export const Linked: Story = { args: { status: "linked" } };
export const Pending: Story = { args: { pending: true } };
export const LinkedResult: Story = {
  name: "連携直後（成功結果のみ）",
  args: { status: "linked", result: "linked" },
};
export const Failed: Story = { args: { result: "failed" } };
export const GoogleAccountInUse: Story = {
  args: { result: "google_account_in_use" },
};
export const Cancelled: Story = { args: { result: "cancelled" } };
export const AlreadyLinked: Story = { args: { result: "already_linked" } };
export const SessionChanged: Story = { args: { result: "session_changed" } };
export const Unavailable: Story = { args: { result: "unavailable" } };
