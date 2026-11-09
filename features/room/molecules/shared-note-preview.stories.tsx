import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { SharedNotePreview } from "./shared-note-preview";

const NOTE = buildNote({
  content:
    "共有済みの考えを読みながら、新しい付箋を書けます。\nこの本文は閲覧のみです。",
});
const meta = {
  title: "Room/SharedNotePreview",
  component: SharedNotePreview,
  parameters: { layout: "fullscreen" },
  args: {
    note: NOTE,
    anchor: null,
    viewport: null,
    panel: null,
    layoutVersion: "0",
    onClose: () => undefined,
  },
  render: function Preview() {
    const viewport = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const anchor = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
      <div className="h-screen bg-background">
        <div ref={viewport} className="absolute inset-0 p-24">
          <button
            ref={anchor}
            type="button"
            onClick={() => setOpen(true)}
            className="h-36 w-48 bg-yellow-200 p-4"
          >
            共有付箋を読む
          </button>
        </div>
        <div
          ref={panel}
          className="absolute inset-x-4 bottom-20 h-64 rounded-xl border bg-card p-4"
        >
          <textarea
            aria-label="新しい考え"
            className="relative z-10 rounded-lg border p-3"
            placeholder="参照しながら書く"
          />
        </div>
        {open ? (
          <SharedNotePreview
            note={NOTE}
            anchor={anchor.current}
            viewport={viewport.current}
            panel={panel.current}
            layoutVersion="0"
            onClose={() => setOpen(false)}
          />
        ) : null}
      </div>
    );
  },
} satisfies Meta<typeof SharedNotePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
