import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <div
          className="relative bg-slate-50"
          style={{ width: 616, height: 432 }}
        >
          <Story />
          <div aria-hidden="true">
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
