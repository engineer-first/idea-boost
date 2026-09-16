import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { PrivateNotesToolbar } from "./private-notes-toolbar";

const singleNote = buildNote({
  id: "single-note",
  visibility: "private",
  content: "追加した付箋の下書き",
});

const manyNotes = Array.from({ length: 8 }, (_, index) =>
  buildNote({
    id: `many-note-${index + 1}`,
    visibility: "private",
    content: `付箋 ${index + 1}`,
  }),
);

const meta = {
  title: "Notes/PrivateNotesToolbar",
  component: PrivateNotesToolbar,
  args: {
    notes: [
      buildNote({
        visibility: "private",
        content: "利用者の困りごとを書き出す",
      }),
      buildNote({
        id: "note-2",
        visibility: "private",
        content: "別の視点も考える",
      }),
    ],
    disabled: false,
    selectedNoteId: null,
    canDeleteNote: true,
    canCreateNote: true,
    canMoveNote: true,
    canEditNote: true,
    onSelect: fn(),
    onAdd: fn(),
    onContentChange: fn(),
    onDelete: fn(),
    onDragStart: fn(),
  },
} satisfies Meta<typeof PrivateNotesToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Collapsed: Story = {
  args: { defaultExpanded: false },
};

export const Empty: Story = {
  args: { notes: [] },
};

export const Single: Story = {
  args: { notes: [singleNote] },
};

export const Many: Story = {
  args: { notes: manyNotes },
};

export const Disconnected: Story = {
  args: { disabled: true },
};

export const ResultStep: Story = {
  args: { editingDisabled: true },
};
