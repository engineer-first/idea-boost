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

export function getLobbyFlowOverview(): LobbyFlowOverview {
  return LOBBY_FLOW_OVERVIEW;
}
