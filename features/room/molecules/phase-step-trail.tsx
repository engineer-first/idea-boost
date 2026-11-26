"use client";

import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { type Ref, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RoomStepPhase } from "@/contracts/phase";
import { getStepKind } from "../logic/lobby-flow";
import {
  getNextStepShortName,
  PHASE_MARKERS,
  PHASE_SHORT_NAMES,
  STEP_SHORT_NAMES,
} from "../logic/phase-labels";
import { BoardFlowSteps } from "./board-flow-steps";
import styles from "./phase-step-trail.module.css";
import { STEP_KIND_ICONS } from "./step-kind-icons";

export type PhaseStepTrailProps = {
  phase: RoomStepPhase;
  // 今のステップを押したときに進め方を開く。渡さないときは今のステップを押せない。
  onOpenGuide?: () => void;
  // 進め方を閉じたときにフォーカスを戻し、閉じる動きの行き先にする今のステップのボタン。
  guideTriggerRef?: Ref<HTMLButtonElement>;
  // タイマーが時間切れの間は、今のステップから次への矢印を動かして次へ進めることを知らせる。
  timeUp?: boolean;
};

type StepState = "done" | "current" | "upcoming";

// 今のフェーズのステップの並びと現在地を、開く操作なしに常に見せる帯。
// フェーズ名から全フェーズの流れを、今のステップからそのステップの進め方を開く。
// ステップは開始待ちの「全体の流れ」と同じ絵と色で、やることの種類を示す。
export function PhaseStepTrail({
  phase,
  onOpenGuide,
  guideTriggerRef,
  timeUp = false,
}: PhaseStepTrailProps) {
  // 全体の流れは、ステップが進んだら閉じて次に開くときに今のフェーズから見せる。
  const stepKey = `${phase.phase}-${phase.step}`;
  const [flow, setFlow] = useState({ stepKey, open: false });
  // 前のステップで開いた状態は持ち越さない。元のステップへ戻っても開き直さない。
  if (flow.stepKey !== stepKey) setFlow({ stepKey, open: false });
  const flowOpen = flow.stepKey === stepKey && flow.open;
  const phaseName = `${PHASE_MARKERS[phase.phase]}${PHASE_SHORT_NAMES[phase.phase]}`;
  return (
    <div
      className={`${styles.trail} board-hud`}
      data-testid="phase-step-trail"
      data-time-up={timeUp ? "true" : undefined}
    >
      <Popover
        open={flowOpen}
        onOpenChange={(open) => setFlow({ stepKey, open })}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${phaseName}：全体の流れを開く`}
            className={styles.phase}
            data-testid="phase-step-trail-phase"
          >
            {phaseName}
            <ChevronDown aria-hidden="true" className={styles.disclosure} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          // 狭い幅でステップバーが隠れたら、浮いた中身も出さない。
          hideWhenDetached
          className={styles.flow}
        >
          <section aria-label="全体の流れと手順" className={styles.flowBody}>
            <BoardFlowSteps phase={phase} />
          </section>
        </PopoverContent>
      </Popover>
      <ol aria-label={`${phaseName}のステップ`} className={styles.steps}>
        {STEP_SHORT_NAMES[phase.phase].map((name, index) => {
          const step = index + 1;
          const state: StepState =
            step < phase.step
              ? "done"
              : step === phase.step
                ? "current"
                : "upcoming";
          const kind = getStepKind({ ...phase, step });
          const Icon = STEP_KIND_ICONS[kind];
          const content = (
            <>
              {state === "done" ? (
                <span role="img" aria-label="完了" className={styles.mark}>
                  <Check aria-hidden="true" strokeWidth={3} />
                </span>
              ) : (
                <span aria-hidden="true" className={styles.mark}>
                  <Icon aria-hidden="true" strokeWidth={2.25} />
                </span>
              )}
              {name}
            </>
          );
          return (
            <li
              key={name}
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              data-kind={kind}
              className={styles.step}
            >
              {state === "current" && onOpenGuide ? (
                <button
                  ref={guideTriggerRef}
                  type="button"
                  aria-label={`「${name}」の進め方を開く`}
                  title="このステップの進め方を見る"
                  className={styles.stepButton}
                  data-testid="phase-step-trail-guide"
                  onClick={onOpenGuide}
                >
                  {content}
                </button>
              ) : (
                content
              )}
              {state === "current" && timeUp ? (
                <span
                  role="img"
                  aria-label={`時間切れ：次の「${getNextStepShortName(phase)}」へ進めます`}
                  className={styles.nextArrow}
                  data-testid="phase-step-trail-next-arrow"
                >
                  <ChevronRight aria-hidden="true" strokeWidth={3} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
