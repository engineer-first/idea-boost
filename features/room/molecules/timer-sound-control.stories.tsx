import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { TimerSoundControl } from "./timer-sound-control";

const meta = {
  title: "Room/TimerSoundControl",
  component: TimerSoundControl,
  decorators: [
    (Story) => (
      <div className="relative h-10 w-28 rounded-lg bg-muted">
        <span className="flex h-10 items-center pl-3 font-mono">03:00</span>
        <Story />
      </div>
    ),
  ],
  args: {
    enabled: false,
    playbackBlocked: false,
    onEnable: fn(async () => undefined),
    onMute: fn(),
    onPreview: fn(async () => undefined),
  },
} satisfies Meta<typeof TimerSoundControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disabled: Story = {};
export const Enabled: Story = {
  args: { enabled: true },
};
export const PlaybackBlocked: Story = {
  args: { playbackBlocked: true },
};
