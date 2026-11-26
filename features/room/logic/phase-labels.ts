import type { RoomPhase, RoomStepPhase } from "@/contracts/phase";

export const PHASE_NUMBERS = [1, 2, 3] as const;
export type PhaseNumber = (typeof PHASE_NUMBERS)[number];

export const PHASE_LABELS: Record<PhaseNumber, string> = {
  1: "課題整理",
  2: "問いの整理",
  3: "アイデア決定",
};

export type PhaseProgressState = "completed" | "current" | "upcoming";

export function getPhaseTitle(phase: RoomPhase): string {
  return phase.kind === "lobby" ? "開始待ち" : PHASE_LABELS[phase.phase];
}

export function getPhaseProgressState(
  phase: RoomPhase,
  targetPhase: PhaseNumber,
): PhaseProgressState {
  if (phase.kind === "lobby") return "upcoming";
  if (targetPhase < phase.phase) return "completed";
  if (targetPhase === phase.phase) return "current";
  return "upcoming";
}

export { getRoomPhaseLabel as getPhaseLabel } from "@/contracts/phase";

// ボード上の狭い場所で使う、フェーズとステップの短い呼び方。
export const PHASE_MARKERS = { 1: "①", 2: "②", 3: "③" } as const;
export const PHASE_SHORT_NAMES = {
  1: "課題",
  2: "問い",
  3: "アイデア",
} as const;
export const STEP_SHORT_NAMES = {
  1: ["個人", "共有", "整理", "投票", "決定"],
  2: ["個人", "共有", "投票", "決定"],
  3: ["個人", "共有", "2軸評価", "投票", "決定"],
} as const satisfies Record<PhaseNumber, readonly string[]>;

// 現在地の「次：」は、ステップの並びと同じ呼び方を使う。フェーズの最後は次のフェーズ、
// 最後のフェーズの最後は成果を示す。
export function getNextStepShortName(phase: RoomStepPhase): string {
  const names: readonly string[] = STEP_SHORT_NAMES[phase.phase];
  const nextStep = names[phase.step];
  if (nextStep) return nextStep;
  return phase.phase < 3
    ? PHASE_SHORT_NAMES[(phase.phase + 1) as 2 | 3]
    : "成果";
}
