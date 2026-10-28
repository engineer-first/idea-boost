import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  GuestNameFormView,
  type GuestNameFormViewProps,
} from "@/features/auth";
import { InviteGuestNameView } from "./invite-guest-name-view";

const formProps: GuestNameFormViewProps = {
  name: "はな",
  pending: false,
  error: null,
  submitLabel: "次へ",
  onNameChange: fn(),
  onSubmit: fn(),
};
const meta = {
  title: "RoomLifecycle/InviteGuestNameView",
  component: InviteGuestNameView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    inviteCode: "ABC234",
    children: <GuestNameFormView {...formProps} />,
  },
} satisfies Meta<typeof InviteGuestNameView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Pending: Story = {
  args: { children: <GuestNameFormView {...formProps} pending /> },
};
export const Failed: Story = {
  name: "Error",
  args: {
    children: (
      <GuestNameFormView
        {...formProps}
        error="名前を保存できませんでした。もう一度お試しください。"
      />
    ),
  },
};
