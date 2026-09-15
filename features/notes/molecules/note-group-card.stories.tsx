import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { NoteGroupCard } from "./note-group-card";

const meta = {
  title: "Notes/NoteGroupCard",
  component: NoteGroupCard,
  parameters: {
    layout: "padded",
  },
  args: {
    group: {
      id: "group-1",
      name: "課題グループ",
      x: 84,
      y: 84,
      width: 448,
      height: 298,
    },
    name: "課題グループ",
    canGroupNote: true,
    onUpdateName: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 600, height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteGroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
