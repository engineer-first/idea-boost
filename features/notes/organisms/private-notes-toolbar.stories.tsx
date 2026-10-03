import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { buildNote } from "@/contracts/room-protocol.fixture";
import {
  PrivateNotesToolbar,
  type PrivateNotesToolbarProps,
} from "./private-notes-toolbar";

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

export const ReturningNote: Story = {
  args: {
    notes: manyNotes.slice(0, 4),
    dropPlaceholder: {
      noteId: "many-note-2",
    },
    isReturnDropTarget: true,
  },
};

export const Disconnected: Story = {
  args: { disabled: true },
};

export const ResultStep: Story = {
  args: { editingDisabled: true },
};

const delayedNewNote = buildNote({
  id: "delayed-new-note",
  visibility: "private",
  content: "",
});
const longNote = buildNote({
  id: "long-note",
  visibility: "private",
  content: "改行を含めた長文の下書き。\n".repeat(120).slice(0, 2000),
});

function DelayedAdditionExample(args: PrivateNotesToolbarProps) {
  const [notes, setNotes] = useState([singleNote]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!adding) return;
    const timer = window.setTimeout(() => {
      setNotes((current) => [...current, delayedNewNote]);
      setAdding(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [adding]);
  return (
    <PrivateNotesToolbar
      {...args}
      notes={notes}
      selectedNoteId={selectedNoteId}
      canCreateNote={
        !adding && !notes.some((note) => note.id === delayedNewNote.id)
      }
      onAdd={() => setAdding(true)}
      onSelect={setSelectedNoteId}
      onContentChange={(id, content) =>
        setNotes((current) =>
          current.map((note) => (note.id === id ? { ...note, content } : note)),
        )
      }
    />
  );
}

export const DelayedAddition: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "追加応答を1.8秒遅らせる表示用の例です。待ち時間に既存付箋をEnterで編集すると、その入力を優先します。サーバー保存の検証には使いません。",
      },
    },
  },
  render: (args) => <DelayedAdditionExample {...args} />,
};

export const LongText: Story = { args: { notes: [longNote, ...manyNotes] } };

export const SaveConfirmationPending: Story = {
  args: {
    notes: [singleNote],
    draftValue: () => "入力した本文。サーバー受理の確認はまだです。",
  },
  parameters: {
    docs: {
      description: {
        story:
          "ACK前の下書きを持つ表示用の例です。受理済みや共有済みは示しません。",
      },
    },
  },
};

export const Sharing: Story = {
  args: {
    canCreateNote: false,
    canDeleteNote: false,
    canShareNote: true,
    onShareNote: fn(),
  },
};

export const PersonalWriting: Story = {
  args: { canMoveNote: false, canShareNote: false, onShareNote: fn() },
};

export const SharingDisconnected: Story = {
  args: { ...Sharing.args, disabled: true },
};

export const SharingSavePending: Story = {
  args: {
    ...Sharing.args,
    notes: [singleNote],
    draftValue: () => "保存を確認中の下書き",
  },
};

export const SharingRecoveryPending: Story = {
  args: {
    ...Sharing.args,
    notes: [singleNote],
    getVisibilityDisabledReason: () => "未保存あり。「確認・コピー」へ",
  },
};
