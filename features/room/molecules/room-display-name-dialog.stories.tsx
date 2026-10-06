import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomDisplayNameDialog } from "./room-display-name-dialog";

const meta = {
  title: "Room/RoomDisplayNameDialog",
  component: RoomDisplayNameDialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof RoomDisplayNameDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const controls = {
  open: true,
  draft: "はな",
  pending: false,
  error: null,
  disabled: false,
  request: () => {},
  onDraftChange: () => {},
  onOpenChange: () => {},
  onConfirm: () => {},
};
export const Editing: Story = { args: { controls } };
export const LongName: Story = {
  args: { controls: { ...controls, draft: "あ".repeat(40) } },
};
export const Saving: Story = {
  args: { controls: { ...controls, pending: true } },
};
export const Failed: Story = {
  args: {
    controls: {
      ...controls,
      error: "送信できませんでした。接続を確認して、もう一度お試しください。",
    },
  },
};
export const Disconnected: Story = {
  args: { controls: { ...controls, disabled: true } },
};
export const Interactive: Story = {
  args: { controls },
  render: () => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("はな");
    return (
      <>
        <Button onClick={() => setOpen(true)}>呼び名を変更</Button>
        <RoomDisplayNameDialog
          controls={{
            ...controls,
            open,
            draft,
            onDraftChange: setDraft,
            onOpenChange: setOpen,
            onConfirm: () => setOpen(false),
          }}
        />
      </>
    );
  },
};
