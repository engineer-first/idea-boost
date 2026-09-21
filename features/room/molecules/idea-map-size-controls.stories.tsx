import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { IdeaMapSizeControls } from "./idea-map-size-controls";

const meta = {
  title: "Room/IdeaMapSizeControls",
  component: IdeaMapSizeControls,
  args: {
    sizeLevel: 2,
    initialized: true,
    isHost: true,
    isDisconnected: false,
    isDragging: false,
    onResize: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-32 items-center justify-center bg-muted/20 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaMapSizeControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HostCanAdjust: Story = {};

export const ParticipantCannotAdjust: Story = {
  args: { isHost: false },
};

export const DraggingBlocked: Story = {
  args: { isDragging: true },
};

export const AtMaximum: Story = {
  args: { sizeLevel: 8 },
};

export const AtMinimum: Story = {
  args: { sizeLevel: 0 },
};
