import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import { RestartWritingConfirmDialog } from "./restart-writing-confirm-dialog";

const meta = {
  title: "Room/RestartWritingConfirmDialog",
  component: RestartWritingConfirmDialog,
  args: {
    phaseNumber: 1,
    disabled: false,
    onConfirm: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-64 items-start justify-end bg-muted/30 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RestartWritingConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Issue: Story = {};
export const Question: Story = { args: { phaseNumber: 2 } };
export const Idea: Story = { args: { phaseNumber: 3 } };
export const Disconnected: Story = { args: { disabled: true } };
/** 確認を開いたまま止め、戻り先と残るものの説明を目で確かめる。 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: /^\d-1に戻って書き足す$/,
      }),
    );
  },
};
export const Pending: Story = {
  render: function PendingRestart(args) {
    const [pending, setPending] = useState(false);
    return (
      <RestartWritingConfirmDialog
        {...args}
        pending={pending}
        onConfirm={() => {
          args.onConfirm();
          setPending(true);
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: /^\d-1に戻って書き足す$/,
      }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole(
      "alertdialog",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^\d-1に戻って書き足す$/ }),
    );
  },
};
