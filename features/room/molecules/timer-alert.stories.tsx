import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TimerAlert } from "./timer-alert";

const meta = {
  title: "Room/TimerAlert",
  component: TimerAlert,
  decorators: [
    (Story) => (
      <div className="relative h-96 bg-canvas">
        <Story />
      </div>
    ),
  ],
  args: { kind: null },
} satisfies Meta<typeof TimerAlert>;
export default meta;
type Story = StoryObj<typeof meta>;

// 通信しないローカルUIなので loading / error は持たない。
export const Hidden: Story = {};
export const OneMinute: Story = { args: { kind: "oneMinute" } };
export const TimeUp: Story = { args: { kind: "timeUp" } };
