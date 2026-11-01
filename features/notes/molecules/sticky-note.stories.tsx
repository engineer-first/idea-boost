import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { StickyNote } from "./sticky-note";

const note = buildNote();

const meta = {
  title: "Notes/StickyNote",
  component: StickyNote,
  decorators: [
    (Story) => (
      <div className="p-24">
        <Story />
      </div>
    ),
  ],
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

export const Selected: Story = {
  args: { isSelected: true },
};

export const AdoptionFocused: Story = {
  args: { isAdoptionFocused: true },
};

export const Excluded: Story = {
  args: { "data-excluded": true },
};

export const DecidedSelected: Story = {
  args: { isDecided: true, isSelected: true },
};
export const FocusedSelected: Story = {
  args: { isAdoptionFocused: true, isSelected: true },
};
export const DecidedFocusedSelected: Story = {
  args: { isDecided: true, isAdoptionFocused: true, isSelected: true },
};

export const ReferenceDecision: Story = {
  args: {
    isDecided: true,
    decisionPresentation: "reference",
    children: (
      <>
        <p className="min-h-0 flex-1 overflow-hidden p-2">
          決定した内容を参照する付箋
        </p>
        <div className="h-16 shrink-0" />
      </>
    ),
  },
};
