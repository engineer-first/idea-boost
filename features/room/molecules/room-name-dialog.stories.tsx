import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomNameDialog } from "./room-name-dialog";

const meta = {
  title: "Room/RoomNameDialog",
  component: RoomNameDialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof RoomNameDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const controls = {
  name: "J05",
  onClosed: () => {},
  open: true,
  draft: "J05",
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
  args: { controls: { ...controls, draft: "あ".repeat(15) } },
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
    const [draft, setDraft] = useState("J05");
    return (
      <>
        <Button onClick={() => setOpen(true)}>ルーム名を変更</Button>
        <RoomNameDialog
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
