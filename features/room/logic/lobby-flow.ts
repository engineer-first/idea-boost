import type { AppLocale } from "@/contracts/app-locale";
import {
  isPersonalWritingStep,
  isPhaseStep,
  isResultStep,
  isVotingStep,
  PHASE_STEP_COUNTS,
  ROOM_PHASE_STEP_LABELS,
  type RoomStepPhase,
} from "@/contracts/phase";
import { getFacilitationGuide } from "./facilitation-guide";
import { PHASE_LABELS, PHASE_NUMBERS, type PhaseNumber } from "./phase-labels";

// 開始待ちの画面に出す「全体の流れ」。ステップ名は contracts の呼び方、
// 目安時間とやることは進行ガイドから組み立て、画面側で書き写さない。

export type LobbyFlowStepKind =
  | "write"
  | "share"
  | "group"
  | "vote"
  | "decide"
  | "map";

export type LobbyFlowStep = {
  phase: PhaseNumber;
  step: number;
  number: string;
  name: string;
  action: string;
  minutes: number;
  kind: LobbyFlowStepKind;
};

export type LobbyFlowPhase = {
  phase: PhaseNumber;
  title: string;
  minutes: number;
  steps: readonly LobbyFlowStep[];
};

export type LobbyFlowOverview = {
  totalMinutes: number;
  phases: readonly LobbyFlowPhase[];
};

function getStepKind(phase: RoomStepPhase): LobbyFlowStepKind {
  if (isPersonalWritingStep(phase)) return "write";
  if (phase.step === 2) return "share";
  if (isVotingStep(phase)) return "vote";
  if (isResultStep(phase)) return "decide";
  if (isPhaseStep(phase, 3, 3)) return "map";
  return "group";
}

function buildStep(phaseNumber: PhaseNumber, step: number): LobbyFlowStep {
  const phase = { kind: "step", phase: phaseNumber, step } as RoomStepPhase;
  const guide = getFacilitationGuide(phase);
  if (!guide) throw new Error(`進行ガイドがありません: ${phaseNumber}-${step}`);
  const labels: Record<number, string> = ROOM_PHASE_STEP_LABELS[phaseNumber];
  return {
    phase: phaseNumber,
    step,
    number: `${phaseNumber}-${step}`,
    name: labels[step].replace(/^\d+-\d+\s*/, ""),
    action: guide.action,
    minutes: guide.durationMinutes,
    kind: getStepKind(phase),
  };
}

function sumMinutes(items: readonly { minutes: number }[]): number {
  return items.reduce((total, item) => total + item.minutes, 0);
}

const LOBBY_FLOW_OVERVIEW: LobbyFlowOverview = (() => {
  const phases = PHASE_NUMBERS.map((phase) => {
    const steps = Array.from({ length: PHASE_STEP_COUNTS[phase] }, (_, index) =>
      buildStep(phase, index + 1),
    );
    return {
      phase,
      title: PHASE_LABELS[phase],
      minutes: sumMinutes(steps),
      steps,
    };
  });
  return { totalMinutes: sumMinutes(phases), phases };
})();

const ENGLISH_PHASE_TITLES: Record<PhaseNumber, string> = {
  1: "Frame the problem",
  2: "Frame the question",
  3: "Choose an idea",
};
const ENGLISH_STEPS: Record<string, { name: string; action: string }> = {
  "1-1": { name: "Write down challenges", action: "Write down challenges" },
  "1-2": { name: "Share your notes", action: "Take turns sharing" },
  "1-3": { name: "Group similar notes", action: "Group similar notes" },
  "1-4": { name: "Vote on the problem", action: "Vote on notes" },
  "1-5": { name: "Choose the problem", action: "Choose one problem" },
  "2-1": {
    name: "Turn the problem into a question",
    action: "Reframe the problem as a question",
  },
  "2-2": { name: "Share your questions", action: "Take turns sharing" },
  "2-3": { name: "Vote on questions", action: "Vote on questions" },
  "2-4": { name: "Choose the question", action: "Choose one question" },
  "3-1": { name: "Write solutions", action: "Write down solutions" },
  "3-2": { name: "Share solutions", action: "Take turns sharing" },
  "3-3": { name: "Compare solutions", action: "Move notes to compare" },
  "3-4": { name: "Vote on solutions", action: "Vote on solutions" },
  "3-5": { name: "Choose a solution", action: "Choose one solution" },
};

export function getLobbyFlowOverview(
  locale: AppLocale = "ja",
): LobbyFlowOverview {
  if (locale === "ja") return LOBBY_FLOW_OVERVIEW;
  const phases = LOBBY_FLOW_OVERVIEW.phases.map((phase) => ({
    ...phase,
    title: ENGLISH_PHASE_TITLES[phase.phase],
    steps: phase.steps.map((step) => ({
      ...step,
      ...(ENGLISH_STEPS[step.number] ?? {
        name: step.name,
        action: step.action,
      }),
    })),
  }));
  return { totalMinutes: LOBBY_FLOW_OVERVIEW.totalMinutes, phases };
}
