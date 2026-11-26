import { Check } from "lucide-react";
import type { RoomStepPhase } from "@/contracts/phase";
import {
  PHASE_MARKERS,
  PHASE_SHORT_NAMES,
  STEP_SHORT_NAMES,
} from "../logic/phase-labels";
import styles from "./phase-step-trail.module.css";

export type PhaseStepTrailProps = {
  phase: RoomStepPhase;
};

type StepState = "done" | "current" | "upcoming";

// 今のフェーズのステップの並びと現在地を、開く操作なしに常に見せる帯。
// 全フェーズの流れと手順の詳細は左上の現在地（BoardLocation）から開く。
export function PhaseStepTrail({ phase }: PhaseStepTrailProps) {
  const phaseName = `${PHASE_MARKERS[phase.phase]}${PHASE_SHORT_NAMES[phase.phase]}`;
  return (
    <div className={`${styles.trail} board-hud`} data-testid="phase-step-trail">
      <span aria-hidden="true" className={styles.phase}>
        {phaseName}
      </span>
      <ol aria-label={`${phaseName}のステップ`} className={styles.steps}>
        {STEP_SHORT_NAMES[phase.phase].map((name, index) => {
          const step = index + 1;
          const state: StepState =
            step < phase.step
              ? "done"
              : step === phase.step
                ? "current"
                : "upcoming";
          return (
            <li
              key={name}
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              className={styles.step}
            >
              {state === "done" ? (
                <span role="img" aria-label="完了" className={styles.mark}>
                  <Check aria-hidden="true" strokeWidth={3} />
                </span>
              ) : null}
              {name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
