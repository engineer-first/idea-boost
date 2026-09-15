import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { StickyNote } from "./sticky-note";

const note = buildNote();

const meta = {
  title: "Notes/StickyNote",
  component: StickyNote,
  args: {
    noteId: note.id,
    children: <p className="p-2 text-sm text-amber-950">付箋の本文</p>,
  },
} satisfies Meta<typeof StickyNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Lifted: Story = {
  args: { isLifted: true },
};

export const Decided: Story = {
  args: { isDecided: true },
};
