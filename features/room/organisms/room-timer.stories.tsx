import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useRef, useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import type { TimerState } from "@/contracts/room-protocol";
import { useRoomTimerSounds } from "../logic/use-room-timer-sounds";
import { RoomTimer, TIMER_DEFAULT_DURATION_MS } from "./room-timer";
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
    soundControls: {
      enabled: false,
      playbackBlocked: false,
      onEnable: fn(async () => undefined),
      onMute: fn(),
    },
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
    timer: buildRunningTimer({ remainingMs: 0, durationMs: 5 * 60_000 }),
    defaultPanelOpen: true,
  },
};
export const EndedHostReconfigure: Story = {
  args: { ...EndedHost.args, defaultPanelOpen: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "設定し直す" }),
    );
  },
};
export const EndedMember: Story = {
  args: { ...EndedHost.args, isHost: false },
};

function TimerSoundPlayground() {
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [timerUpdateVersion, setTimerUpdateVersion] = useState(0);
  const expiryRef = useRef<number | null>(null);
  const runTokenRef = useRef(0);
  const soundControls = useRoomTimerSounds({
    timer,
    serverOffsetMs: 0,
    timerUpdateVersion,
  });

  useEffect(
    () => () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    },
    [],
  );

  const publish = (nextTimer: TimerState) => {
    setTimer(nextTimer);
    setTimerUpdateVersion((version) => version + 1);
  };
  const clearExpiry = () => {
    runTokenRef.current += 1;
    if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    expiryRef.current = null;
  };
  const scheduleExpiry = (
    nextTimer: Extract<TimerState, { status: "running" }>,
  ) => {
    clearExpiry();
    const token = runTokenRef.current;
    expiryRef.current = window.setTimeout(
      () => {
        if (runTokenRef.current !== token) return;
        publish({ status: "ended", durationMs: nextTimer.durationMs });
        expiryRef.current = null;
      },
      Math.max(0, nextTimer.endsAt - Date.now()),
    );
  };
  const start = (durationMs: number) => {
    const nextTimer: Extract<TimerState, { status: "running" }> = {
      status: "running",
      endsAt: Date.now() + durationMs,
      durationMs,
    };
    publish(nextTimer);
    scheduleExpiry(nextTimer);
  };

  return (
    <RoomTimer
      timer={timer}
      serverOffsetMs={0}
      soundControls={soundControls}
      isHost
      disabled={false}
      onStart={start}
      onPause={() => {
        if (timer.status !== "running") return;
        const remainingMs = Math.max(0, timer.endsAt - Date.now());
        clearExpiry();
        publish({
          status: "paused",
          remainingMs,
          durationMs: timer.durationMs,
        });
      }}
      onResume={() => {
        if (timer.status !== "paused") return;
        const nextTimer: Extract<TimerState, { status: "running" }> = {
          status: "running",
          endsAt: Date.now() + timer.remainingMs,
          durationMs: timer.durationMs,
        };
        publish(nextTimer);
        scheduleExpiry(nextTimer);
      }}
      onExtend={() => {
        if (timer.status !== "running") return;
        const nextTimer = {
          ...timer,
          endsAt: timer.endsAt + 60_000,
          durationMs: timer.durationMs + 60_000,
        };
        publish(nextTimer);
        scheduleExpiry(nextTimer);
      }}
      onStop={() => {
        if (timer.status !== "paused") return;
        clearExpiry();
        publish({ status: "ended", durationMs: timer.durationMs });
      }}
      initialDurationMs={TIMER_DEFAULT_DURATION_MS}
    />
  );
}

export const SoundPlayground: Story = {
  render: () => <TimerSoundPlayground />,
};
