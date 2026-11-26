import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoomEntryField } from "./room-entry-field";

const meta = {
  title: "RoomLifecycle/RoomEntryField",
  component: RoomEntryField,
  parameters: { layout: "padded" },
  args: {
    id: "room-name",
    label: "テーマ（任意）",
    placeholder: "例：通学で困っていること",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomEntryField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoomName: Story = {};

// エラーは入力の下の確保済みの枠に出し、ボタンの位置を動かさない。
export const RoomNameTooLong: Story = {
  args: {
    defaultValue: "あ".repeat(16),
    error: "テーマは15文字以内で入力してください。",
  },
};

export const InviteCode: Story = {
  args: {
    id: "code",
    label: "招待コード",
    placeholder: "AB12CD",
    className: "font-mono text-center tracking-[0.35em] uppercase",
  },
};

export const InvalidCode: Story = {
  args: {
    ...InviteCode.args,
    defaultValue: "AB",
    error: "英数字6桁で入力してください。",
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
