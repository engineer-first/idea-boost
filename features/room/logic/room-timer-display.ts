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
  /** 円の残りの色。CSS 変数（DESIGN.md の色トークン）で返す */
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

/** 残り時間が入っている段階。設定時間がしきい値以下の段階は、開始直後に入らないよう飛ばす */
function getStage(durationMs: number, remainingMs: number): RoomTimerUrgency {
  if (remainingMs <= 0) return "none";
  const stage = URGENCY_STAGES.find(
    ({ thresholdMs }) => remainingMs <= thresholdMs && durationMs > thresholdMs,
  );
  return stage?.urgency ?? "none";
}

/** 円の残りの色。外枠の合図（残り1分・30秒）と同じ段階で、DESIGN.md の色トークンに切り替える */
const STAGE_COLORS: Record<RoomTimerUrgency, string> = {
  none: "var(--ib-color-primary)",
  minute: "var(--ib-color-warning)",
  half: "var(--ib-color-danger)",
  final: "var(--ib-color-danger)",
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
  const stage = getStage(durationMs, remainingMs);
  const seconds = Math.ceil(remainingMs / 1000);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return {
    remainingMs,
    remainingRatio,
    elapsedDegrees: (1 - remainingRatio) * 360,
    color: STAGE_COLORS[stage],
    label,
    durationLabel: formatDurationLabel(durationMs),
    urgency: timer.status === "running" ? stage : "none",
    ended:
      timer.status === "ended" ||
      (timer.status === "running" && remainingMs === 0),
  };
}
