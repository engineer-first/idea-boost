import type { RoomPhase } from "@/contracts/phase";

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
