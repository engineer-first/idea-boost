"use client";

import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROOM_PHASE_STEP_LABELS, type RoomPhase } from "@/contracts/phase";
import {
  getPhaseProgressState,
  PHASE_MARKERS,
  PHASE_NUMBERS,
  type PhaseNumber,
} from "../logic/phase-labels";
import styles from "./board-flow-steps.module.css";

export type BoardFlowStepsProps = {
  phase: RoomPhase;
};

// 3つのフェーズの手順を、フェーズごとのタブで見せる。開いたときは今のフェーズを選ぶ。
// 左上の現在地と、中央のステップバーのフェーズ名の両方から開く。
export function BoardFlowSteps({ phase }: BoardFlowStepsProps) {
  const t = useTranslations("app.boardLocation");
  const translate = (key: string) => t(key as Parameters<typeof t>[0]);
  const [viewedPhase, setViewedPhase] = useState<PhaseNumber>(
    phase.kind === "step" ? phase.phase : 1,
  );
  return (
    <Tabs
      value={String(viewedPhase)}
      onValueChange={(value) => setViewedPhase(Number(value) as PhaseNumber)}
      className="min-h-0 gap-0"
    >
      <TabsList
        aria-label={t("phaseTabs")}
        data-testid="board-phase-progress"
        variant="line"
        className={styles.phases}
      >
        {PHASE_NUMBERS.map((number, index) => (
          <Fragment key={number}>
            <TabsTrigger
              value={String(number)}
              aria-label={t("phaseTabLabel", {
                phase: `${PHASE_MARKERS[number]} ${translate(`phaseNames.${number}`)}`,
              })}
              aria-current={
                phase.kind === "step" && phase.phase === number
                  ? "step"
                  : undefined
              }
              data-phase-state={getPhaseProgressState(phase, number)}
              data-testid={`board-phase-${number}`}
              className={styles.phaseTab}
            >
              <span
                aria-hidden="true"
                className={styles.phaseNumber}
                data-current={phase.kind === "step" && phase.phase === number}
              >
                {number}
              </span>
              <span>{translate(`phaseNames.${number}`)}</span>
            </TabsTrigger>
            {index < 2 ? (
              <ArrowRight
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
            ) : null}
          </Fragment>
        ))}
      </TabsList>
      {PHASE_NUMBERS.map((number) => (
        <TabsContent
          key={number}
          value={String(number)}
          className={styles.stepScroll}
        >
          <ol aria-label={t("allPhaseSteps")} className={styles.steps}>
            {Object.keys(ROOM_PHASE_STEP_LABELS[number]).map((step) => {
              const current =
                phase.kind === "step" &&
                phase.phase === number &&
                phase.step === Number(step);
              const completed =
                phase.kind === "step" &&
                (number < phase.phase ||
                  (number === phase.phase && Number(step) < phase.step));
              return (
                <li
                  key={step}
                  aria-current={current ? "step" : undefined}
                  data-testid={current ? "board-current-step" : undefined}
                >
                  {completed ? (
                    <span
                      role="img"
                      aria-label={t("completed")}
                      className={styles.stepMarker}
                    >
                      <Check aria-hidden="true" className="size-3.5" />
                    </span>
                  ) : (
                    <span aria-hidden="true" className={styles.stepMarker}>
                      {step}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    {translate(`fullSteps.${number}-${step}`)}
                  </span>
                  {current ? (
                    <span className={styles.currentLabel}>{t("current")}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}
