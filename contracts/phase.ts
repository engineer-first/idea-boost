// ルームの進行状態コントラクト。lobby と、フェーズごとのステップを
// 判別可能な直和で表す。後続フェーズを追加するときは PHASE_STEP_COUNTS、
// ROOM_PHASE_STEP_LABELS、RoomPhaseSchema の3箇所を拡張する。
import { z } from "zod";

export const PHASE_STEP_COUNTS = { 1: 5, 2: 4, 3: 5 } as const;

export const ROOM_PHASE_STEP_LABELS = {
  1: {
    1: "1-1 自分の課題（個人）",
    2: "1-2 課題共有",
    3: "1-3 グループ化",
    4: "1-4 投票",
    5: "1-5 課題決定",
  },
  2: {
    1: "2-1 課題に対するHMW（個人）",
    2: "2-2 HMW共有",
    3: "2-3 投票",
    4: "2-4 HMW決定",
  },
  3: {
    1: "3-1 アイデアを書き出す（個人）",
    2: "3-2 共有・分類（チーム）",
    3: "3-3 価値×実現のしやすさで評価",
    4: "3-4 ドット投票",
    5: "3-5 アイデアを決定",
  },
} as const;

export const VOTING_STEP_BY_PHASE = { 1: 4, 2: 3, 3: 4 } as const;

export const RESULT_STEP_BY_PHASE = { 1: 5, 2: 4, 3: 5 } as const;

export const RoomPhaseSchema = z.union([
  z.object({ kind: z.literal("lobby") }),
  z.object({
    kind: z.literal("step"),
    phase: z.literal(1),
    step: z.number().int().min(1).max(PHASE_STEP_COUNTS[1]),
  }),
  z.object({
    kind: z.literal("step"),
    phase: z.literal(2),
    step: z.number().int().min(1).max(PHASE_STEP_COUNTS[2]),
  }),
  z.object({
    kind: z.literal("step"),
    phase: z.literal(3),
    step: z.number().int().min(1).max(PHASE_STEP_COUNTS[3]),
  }),
]);

export type RoomPhase = z.infer<typeof RoomPhaseSchema>;
export type RoomStepPhase = Extract<RoomPhase, { kind: "step" }>;

type RoomPhaseLabelTarget =
  | RoomPhase
  | { kind: "step"; phase: number; step: number };

export function getRoomPhaseLabel(phase: RoomPhaseLabelTarget): string {
  if (phase.kind === "lobby") return "開始待ち";
  const labels = ROOM_PHASE_STEP_LABELS[
    phase.phase as keyof typeof ROOM_PHASE_STEP_LABELS
  ] as Record<number, string> | undefined;
  return (
    labels?.[phase.step] ?? `フェーズ${phase.phase}・ステップ${phase.step}`
  );
}

export function isLobby(
  phase: RoomPhase,
): phase is Extract<RoomPhase, { kind: "lobby" }> {
  return phase.kind === "lobby";
}

export function isPhaseStep(
  phase: RoomPhase,
  expectedPhase: number,
  expectedStep: number,
): boolean {
  return (
    phase.kind === "step" &&
    phase.phase === expectedPhase &&
    phase.step === expectedStep
  );
}

export function isVotingStep(phase: RoomPhase): boolean {
  return (
    phase.kind === "step" && phase.step === VOTING_STEP_BY_PHASE[phase.phase]
  );
}

// リアルタイムカーソルは共有作業中だけ扱う。各フェーズの Step 1 は個人執筆、
// 投票 Step は他者の動きによる同調を避けるステルス投票なので共有しない。
export function isCursorSharingAllowed(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.step !== 1 && !isVotingStep(phase);
}

export function isAtOrAfterGroupingStep(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.phase === 1 && phase.step >= 3;
}

export function isPublishAllowedStep(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.step >= 2;
}

export function isResultStep(phase: RoomPhase): boolean {
  return (
    phase.kind === "step" && phase.step === RESULT_STEP_BY_PHASE[phase.phase]
  );
}

export function isIdeaSupportAvailableStep(phase: RoomPhase): boolean {
  return isPhaseStep(phase, 3, 1) || isPhaseStep(phase, 3, 2);
}
