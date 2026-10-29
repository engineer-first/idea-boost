import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  ROOM_DISPLAY_NAME_MAX_LENGTH,
  RoomDisplayNameSchema,
} from "@/contracts/room-protocol";
import { guestIdentityFailure } from "../logic/guest-identity-copy";
import { GuestNameFormView } from "./guest-name-form-view";

const meta = {
  title: "Auth/GuestNameForm",
  component: GuestNameFormView,
  decorators: [
    (Story) => (
      <div className="w-full max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    name: "",
    pending: false,
    error: null,
    onNameChange: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof GuestNameFormView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { name: "入力前" };
export const Filled: Story = { name: "入力済み", args: { name: "はな" } };
export const Pending: Story = {
  name: "送信中",
  args: { name: "はな", pending: true },
};
export const Failed: Story = {
  name: "失敗",
  args: {
    name: "はな",
    error: guestIdentityFailure,
  },
};
const invalidName = "あ".repeat(ROOM_DISPLAY_NAME_MAX_LENGTH + 1);
const invalidResult = RoomDisplayNameSchema.safeParse(invalidName);
export const Join: Story = {
  name: "参加ボタン",
  args: { name: "はな", submitLabel: "参加する" },
};
export const Invalid: Story = {
  name: "入力エラー",
  args: {
    name: invalidName,
    error: invalidResult.success ? null : invalidResult.error.issues[0].message,
  },
};
