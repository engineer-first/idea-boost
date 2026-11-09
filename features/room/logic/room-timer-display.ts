import type { TimerState } from "@/contracts/room-protocol";

export type RoomTimerDisplay = {
  remainingMs: number;
  remainingRatio: number;
  elapsedDegrees: number;
  color: string;
  label: string;
  ended: boolean;
};

export function getRoomTimerDisplay(
  timer: TimerState,
  initialDurationMs: number,
  serverNow: number,
): RoomTimerDisplay {
  const durationMs =
    timer.status === "idle" ? initialDurationMs : timer.durationMs;
  const remainingMs =
    timer.status === "running"
      ? Math.max(0, timer.endsAt - serverNow)
      : timer.status === "paused"
        ? timer.remainingMs
        : timer.status === "ended"
          ? 0
          : durationMs;
  const remainingRatio =
    durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;
  const safe = [34, 197, 94];
  const warning = [234, 179, 8];
  const urgent = [239, 68, 68];
  const from = remainingRatio >= 0.5 ? warning : urgent;
  const to = remainingRatio >= 0.5 ? safe : warning;
  const mix =
    remainingRatio >= 0.5
      ? (remainingRatio - 0.5) * 2
      : Math.max(0, (remainingRatio - 0.2) / 0.3);
  const rgb = from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * mix),
  );
  const seconds = Math.ceil(remainingMs / 1000);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return {
    remainingMs,
    remainingRatio,
    elapsedDegrees: (1 - remainingRatio) * 360,
    color: `rgb(${rgb.join(", ")})`,
    label,
    ended:
      timer.status === "ended" ||
      (timer.status === "running" && remainingMs === 0),
  };
}
