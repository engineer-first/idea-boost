import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { NoteFontSizeControls } from "./note-font-size-controls";

const meta = {
  title: "Room/NoteFontSizeControls",
  component: NoteFontSizeControls,
  args: {
    fontSize: 14,
    disabled: false,
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="min-h-40 bg-muted/20 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteFontSizeControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Minimum: Story = { args: { fontSize: 12 } };
export const Maximum: Story = { args: { fontSize: 24 } };
export const NoSelection: Story = {
  args: { fontSize: null, disabled: true },
};
