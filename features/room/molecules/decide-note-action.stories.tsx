import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DecideNoteAction } from "./decide-note-action";

const meta = {
  title: "Room/DecideNoteAction",
  component: DecideNoteAction,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    x: 180,
    y: 120,
    onDecide: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 640, height: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DecideNoteAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedNote: Story = {};
