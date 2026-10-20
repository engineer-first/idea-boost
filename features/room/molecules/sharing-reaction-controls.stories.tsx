import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import { SharingReactionControls } from "./sharing-reaction-controls";

const meta = {
  title: "Room/SharingReactionControls",
  component: SharingReactionControls,
  args: { disabled: false, onSendLike: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-52 items-end justify-center bg-muted/20 p-6">
        <div className="rounded-xl border border-border bg-background p-1 shadow-lg shadow-black/5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SharingReactionControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReactionHint: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "リアクション" }));
    await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
      {},
      { timeout: 2000 },
    );
  },
};

export const BarOpen: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
  },
};

export const LikeHint: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(body.getByRole("button", { name: "いいねを送る" }));
    await body.findByRole("tooltip", {}, { timeout: 2000 });
  },
};

export const WaitingToSend: Story = {
  render: function WaitingToSend(args) {
    const [disabled, setDisabled] = useState(false);
    return (
      <SharingReactionControls
        {...args}
        disabled={disabled}
        onSendLike={() => {
          args.onSendLike();
          setDisabled(true);
        }}
      />
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "いいねを送る",
      }),
    );
  },
};

export const Disconnected: Story = {
  args: { disabled: true },
};
