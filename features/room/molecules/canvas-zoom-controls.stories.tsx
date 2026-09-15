import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { CanvasZoomControls } from "./canvas-zoom-controls";

const meta = {
  title: "Room/CanvasZoomControls",
  component: CanvasZoomControls,
  args: {
    zoom: 1,
    onZoomOut: fn(),
    onResetZoom: fn(),
    onZoomIn: fn(),
    onFitToNotes: fn(),
  },
} satisfies Meta<typeof CanvasZoomControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Zoomed: Story = {
  args: { zoom: 2.5 },
};
