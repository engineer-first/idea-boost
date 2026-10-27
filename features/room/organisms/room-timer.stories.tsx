import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import type { TimerState } from "@/contracts/room-protocol";
import { useRoomTimerSounds } from "../logic/use-room-timer-sounds";
import { TimerSoundControl } from "../molecules/timer-sound-control";
import { RoomTimer } from "./room-timer";
import {
  buildEndedTimer,
  buildPausedTimer,
  buildRunningTimer,
  ROOM_TIMER_FIXTURE_NOW,
} from "./room-timer.fixture";

const meta = {
  title: "Room/RoomTimer",
  component: RoomTimer,
  parameters: { layout: "fullscreen" },
  args: {
    timer: { status: "idle" },
    serverOffsetMs: 0,
    disabled: false,
    initialDurationMs: 300_000,
    onStart: fn(),
    onResume: fn(),
    onExtend: fn(),
    now: () => ROOM_TIMER_FIXTURE_NOW,
  },
} satisfies Meta<typeof RoomTimer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const IdleHost: Story = {};
export const IdleMember: Story = {};
export const RunningHost: Story = {
  args: {
    timer: buildRunningTimer({ durationMs: 300_000, remainingMs: 240_000 }),
  },
};
export const HalfTime: Story = {
  args: {
    timer: buildRunningTimer({ durationMs: 300_000, remainingMs: 150_000 }),
  },
};
export const NearlyEnded: Story = {
  args: {
    timer: buildRunningTimer({ durationMs: 300_000, remainingMs: 30_000 }),
  },
};
export const RunningMember: Story = RunningHost;
export const PausedHost: Story = { args: { timer: buildPausedTimer() } };
export const PausedMember: Story = PausedHost;
export const PausedDisconnected: Story = {
  args: { timer: buildPausedTimer(), disabled: true },
};
export const EndedHost: Story = { args: { timer: buildEndedTimer() } };
export const EndedMember: Story = EndedHost;
export const EndedAfterExtension: Story = {
  args: { timer: { status: "ended", durationMs: 60_000, extensionUsed: true } },
  parameters: {
    docs: {
      description: {
        story:
          "延長終了後は空の円を表示しません。ルームでは必須条件が揃うと自動で次の工程へ進みます。",
      },
    },
  },
};
export const SharingComplete: Story = {
  args: {
    timer: { status: "idle" },
    sharingComplete: true,
    onRestartWriting: fn(),
    onReplay: fn(),
  },
};
export const Disconnected: Story = {
  args: { ...EndedHost.args, disabled: true },
};

function InteractiveTimer({
  sound = false,
  durationMs = 3_000,
}: {
  sound?: boolean;
  durationMs?: number;
}) {
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [version, setVersion] = useState(0);
  const sounds = useRoomTimerSounds({
    timer,
    serverOffsetMs: 0,
    timerUpdateVersion: version,
  });
  useEffect(() => {
    if (timer.status !== "running") return;
    const timeout = window.setTimeout(
      () => {
        setTimer({
          status: "ended",
          durationMs: timer.durationMs,
          ...(timer.extensionUsed ? { extensionUsed: true } : {}),
        });
        setVersion((v) => v + 1);
      },
      Math.max(0, timer.endsAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [timer]);
  return (
    <>
      <RoomTimer
        timer={timer}
        serverOffsetMs={0}
        disabled={false}
        initialDurationMs={sound ? 8_000 : durationMs}
        onStart={(durationMs) => {
          setTimer({
            status: "running",
            endsAt: Date.now() + durationMs,
            durationMs,
          });
          setVersion((v) => v + 1);
        }}
        onExtend={() => {
          setTimer({
            status: "running",
            endsAt: Date.now() + 60_000,
            durationMs: 60_000,
            extensionUsed: true,
          });
          setVersion((v) => v + 1);
        }}
        onResume={() => {
          if (timer.status !== "paused") return;
          setTimer({
            status: "running",
            endsAt: Date.now() + timer.remainingMs,
            durationMs: timer.durationMs,
          });
          setVersion((v) => v + 1);
        }}
      />
      {sound ? (
        <div className="fixed left-4 top-4 h-10 w-32">
          <TimerSoundControl {...sounds} />
        </div>
      ) : null}
    </>
  );
}
export const Interactive: Story = {
  render: () => <InteractiveTimer />,
  parameters: {
    docs: {
      description: {
        story: "円を押すと3秒で時間切れになり、1分延長を選べます。",
      },
    },
  },
};
export const InteractiveRunning: Story = {
  render: () => <InteractiveTimer durationMs={300_000} />,
};
export const SoundPlayground: Story = {
  render: () => <InteractiveTimer sound />,
};
