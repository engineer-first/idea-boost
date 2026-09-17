import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { RoomTimer } from "./room-timer";
import {
  buildEndedTimer,
  buildPausedTimer,
  buildRunningTimer,
  ROOM_TIMER_FIXTURE_NOW,
  ROOM_TIMER_IDLE_MAX_ADJUST_DURATION_MS,
  ROOM_TIMER_IDLE_MIN_DURATION_MS,
} from "./room-timer.fixture";

const meta = {
  title: "Room/RoomTimer",
  component: RoomTimer,
  args: {
    timer: { status: "idle" },
    serverOffsetMs: 0,
    isHost: true,
    disabled: false,
    onStart: fn(),
    onPause: fn(),
    onResume: fn(),
    onExtend: fn(),
    onStop: fn(),
    now: () => ROOM_TIMER_FIXTURE_NOW,
  },
} satisfies Meta<typeof RoomTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdleHost: Story = {};
export const IdleHostPanelOpen: Story = {
  args: { defaultPanelOpen: true },
};
export const IdleHostMinimum: Story = {
  args: { initialDurationMs: ROOM_TIMER_IDLE_MIN_DURATION_MS },
};
export const IdleHostMaximum: Story = {
  args: { initialDurationMs: ROOM_TIMER_IDLE_MAX_ADJUST_DURATION_MS },
};
export const IdleMember: Story = { args: { isHost: false } };
export const RunningHost: Story = {
  args: {
    timer: buildRunningTimer(),
  },
};
export const RunningHostPanelOpen: Story = {
  args: { ...RunningHost.args, defaultPanelOpen: true },
};
export const RunningMember: Story = {
  args: { ...RunningHost.args, isHost: false },
};
export const PausedHost: Story = {
  args: {
    timer: buildPausedTimer(),
  },
};
export const PausedHostPanelOpen: Story = {
  args: { ...PausedHost.args, defaultPanelOpen: true },
};
export const PausedMember: Story = {
  args: { ...PausedHost.args, isHost: false },
};
export const EndedHost: Story = {
  args: {
    timer: buildEndedTimer(),
  },
};
export const EndedHostPanelOpen: Story = {
  args: { ...EndedHost.args, defaultPanelOpen: true },
};
export const ExpiredHostPanelOpen: Story = {
  args: {
    timer: buildRunningTimer({ remainingMs: 0 }),
    defaultPanelOpen: true,
  },
};
export const EndedHostReconfigure: Story = {
  args: { ...EndedHost.args, defaultPanelOpen: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "もう一度設定" }),
    );
  },
};
export const EndedMember: Story = {
  args: { ...EndedHost.args, isHost: false },
};
