import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RenderGroup } from "@/contracts/grouping";
import { NoteGroupCard } from "./note-group-card";
import { StickyNote } from "./sticky-note";

const defaultGroup = {
  id: "group-1",
  name: "課題グループ",
  x: 84,
  y: 84,
  width: 448,
  height: 298,
  hue: 210,
} satisfies RenderGroup;

const longGroupName =
  "ユーザー体験の改善候補を優先度別に整理した次回検証対象のアイデアグループ（追加調査と実装判断を含む）";

const meta = {
  title: "Notes/NoteGroupCard",
  component: NoteGroupCard,
  parameters: {
    layout: "padded",
  },
  args: {
    group: defaultGroup,
    name: defaultGroup.name,
    canGroupNote: true,
    onUpdateName: fn(),
  },
  decorators: [
    (Story, context) => (
      <TooltipProvider delayDuration={0}>
        <div
          className="relative bg-slate-50"
          style={{ width: "min(616px, 100%)", height: 432 }}
        >
          <Story />
          <div
            aria-hidden="true"
            hidden={context.parameters.previewNotes === false}
          >
            <StickyNote
              noteId="preview-note-1"
              color="yellow"
              className="absolute z-10 p-4 text-sm font-medium"
              style={{ left: 108, top: 116 }}
            >
              顧客の困りごとを整理する
            </StickyNote>
            <StickyNote
              noteId="preview-note-2"
              color="green"
              className="absolute z-10 p-4 text-sm font-medium"
              style={{ left: 328, top: 226 }}
            >
              次の検証方法を決める
            </StickyNote>
          </div>
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof NoteGroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TemporaryGroup: Story = {
  args: {
    group: {
      ...defaultGroup,
      id: "temp-note-1,note-2",
      name: "グループ",
      isTemp: true,
      representativeNoteId: "preview-note-1",
    },
    name: "グループ",
  },
};

export const LongName: Story = {
  args: {
    group: {
      ...defaultGroup,
      name: longGroupName,
    },
    name: longGroupName,
  },
};

export const ReadOnly: Story = {
  args: {
    canGroupNote: false,
  },
};

export const EmptyName: Story = {
  args: { name: "" },
};

export const Interactive: Story = {
  render: function InteractiveGroup(args) {
    const [name, setName] = useState(args.name);
    return <NoteGroupCard {...args} name={name} onUpdateName={setName} />;
  },
};

export const ConcurrentRename: Story = {
  render: function ConcurrentGroup(args) {
    const [name, setName] = useState(args.name);
    return (
      <>
        <button
          type="button"
          className="absolute bottom-2 left-2 rounded border bg-background px-3 py-2"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setName("別参加者が共有した名前")}
        >
          別参加者の改名を受信
        </button>
        <NoteGroupCard {...args} name={name} onUpdateName={args.onUpdateName} />
      </>
    );
  },
};

export const UnconfirmedRename: Story = {
  // サーバーの確定応答がない場合は共有名を変えない。
};

export const NarrowInteractive: Story = {
  ...Interactive,
  args: { group: { ...defaultGroup, x: 24, y: 120, width: 340 } },
  parameters: { previewNotes: false },
};

export const DelayedRename: Story = {
  render: function DelayedGroup(args) {
    const [name, setName] = useState(args.name);
    return (
      <NoteGroupCard
        {...args}
        name={name}
        onUpdateName={(nextName) => setTimeout(() => setName(nextName), 2200)}
      />
    );
  },
};
