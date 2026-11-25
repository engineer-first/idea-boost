import type { TimerState } from "@/contracts/room-protocol";

/** 残り時間が迫ったことを段階的に知らせる。段階ごとに見た目を強める */
export type RoomTimerUrgency = "none" | "minute" | "half" | "final";

const URGENCY_STAGES: readonly {
  urgency: Exclude<RoomTimerUrgency, "none">;
  thresholdMs: number;
}[] = [
  { urgency: "final", thresholdMs: 10_000 },
  { urgency: "half", thresholdMs: 30_000 },
  { urgency: "minute", thresholdMs: 60_000 },
];

export type RoomTimerDisplay = {
  remainingMs: number;
  remainingRatio: number;
  elapsedDegrees: number;
  color: string;
  label: string;
  /** そのステップの設定時間（例「5分」「1分30秒」） */
  durationLabel: string;
  urgency: RoomTimerUrgency;
  ended: boolean;
};

function formatDurationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}秒`;
  return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`;
}

/** 稼働中だけ段階を返す。設定時間がしきい値以下の段階は、開始直後に鳴らないよう飛ばす */
function getUrgency(
  timer: TimerState,
  durationMs: number,
  remainingMs: number,
): RoomTimerUrgency {
  if (timer.status !== "running" || remainingMs <= 0) return "none";
  const stage = URGENCY_STAGES.find(
    ({ thresholdMs }) => remainingMs <= thresholdMs && durationMs > thresholdMs,
  );
  return stage?.urgency ?? "none";
}

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
    durationLabel: formatDurationLabel(durationMs),
    urgency: getUrgency(timer, durationMs, remainingMs),
    ended:
      timer.status === "ended" ||
      (timer.status === "running" && remainingMs === 0),
  };
}
