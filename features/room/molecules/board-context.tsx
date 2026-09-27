"use client";

import { Check, ChevronRight, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import {
  PHASE_STEP_COUNTS,
  ROOM_PHASE_STEP_LABELS,
  type RoomPhase,
} from "@/contracts/phase";
import {
  getPhaseLabel,
  getPhaseProgressState,
  getPhaseTitle,
  PHASE_LABELS,
  PHASE_NUMBERS,
} from "../logic/phase-labels";

const PROGRESS_STEPS = [1, 2, 3, 4, 5] as const;

function getPhaseContext(phase: RoomPhase): {
  title: string;
  step: number;
  stepCount: number;
  stepLabel: string;
} {
  if (phase.kind === "lobby") {
    return {
      title: "開始待ち",
      step: 0,
      stepCount: 1,
      stepLabel: "準備中",
    };
  }

  return {
    title: getPhaseTitle(phase),
    step: phase.step,
    stepCount: PHASE_STEP_COUNTS[phase.phase],
    stepLabel: getPhaseLabel(phase).replace(/^\d+-\d+\s*/, ""),
  };
}

export type BoardContextProps = {
  phase: RoomPhase;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
};

export function BoardContext({
  phase,
  hmwDecidedIssue,
  decidedHmw,
}: BoardContextProps) {
  const context = getPhaseContext(phase);
  const [isRouteOpen, setRouteOpen] = useState(false);
  const routeId = useId();
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const decisions = [
    { id: "hmw", label: "決定したHMW", content: decidedHmw },
    { id: "issue", label: "決定した課題", content: hmwDecidedIssue },
  ].filter((item) => item.content !== null);
  return (
    <header
      data-testid="board-context-hud"
      className="board-hud facilitation-guide-material pointer-events-auto min-w-0 shrink-0 overflow-hidden rounded-2xl border border-border bg-background shadow-lg shadow-black/5"
    >
      <nav
        aria-label="アイデア出しのフェーズ進行"
        data-testid="board-phase-progress"
        className="border-b border-border px-3 py-2.5 sm:px-4"
      >
        <ol className="grid grid-cols-3 items-center gap-1">
          {PHASE_NUMBERS.map((phaseNumber, index) => {
            const state = getPhaseProgressState(phase, phaseNumber);
            const markerClassName =
              state === "current"
                ? "rounded-full bg-primary text-primary-foreground"
                : state === "completed"
                  ? "rounded-md bg-muted-foreground/15 text-foreground"
                  : "rounded-sm border border-dashed border-border text-muted-foreground";
            const labelClassName =
              state === "current"
                ? "font-semibold text-primary"
                : state === "completed"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground";

            return (
              <li
                key={`phase-${phaseNumber}`}
                aria-current={state === "current" ? "step" : undefined}
                data-phase-state={state}
                data-testid={`board-phase-${phaseNumber}`}
                className="flex min-w-0 items-center"
              >
                <span
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-center text-[10px] leading-4 sm:gap-1.5 sm:px-1.5 sm:text-xs ${labelClassName}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold leading-none ${markerClassName}`}
                  >
                    {state === "completed" ? (
                      <Check className="size-3" />
                    ) : (
                      phaseNumber
                    )}
                  </span>
                  <span className="min-w-0 whitespace-nowrap">
                    {PHASE_LABELS[phaseNumber]}
                  </span>
                </span>
                {index < PHASE_NUMBERS.length - 1 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="px-3 py-3 sm:px-4">
        <span className="flex items-center gap-2">
          <span
            id="board-current-step"
            data-testid="board-current-step"
            className="min-w-0 flex-1 text-sm font-semibold"
          >
            {context.stepLabel}
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {context.step}/{context.stepCount}
          </span>
        </span>
        <span
          role="progressbar"
          aria-label={`${context.title}の進行状況`}
          aria-valuemin={0}
          aria-valuemax={context.stepCount}
          aria-valuenow={context.step}
          className="mt-2.5 flex h-0.5 w-full gap-1"
          data-testid="board-progress-rail"
        >
          {PROGRESS_STEPS.slice(0, context.stepCount).map((stepNumber) => (
            <span
              key={stepNumber}
              className={`h-full flex-1 rounded-full ${
                stepNumber <= context.step ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </span>
        {phase.kind === "step" ? (
          <>
            <button
              type="button"
              aria-expanded={isRouteOpen}
              aria-controls={routeId}
              className="mt-3 min-h-8 text-xs text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => setRouteOpen(!isRouteOpen)}
            >
              {isRouteOpen ? "全手順を閉じる" : "全手順を見る"}
            </button>
            {isRouteOpen ? (
              <ol
                id={routeId}
                aria-label="このフェーズの全手順"
                className="mt-2 space-y-1 text-xs leading-5"
              >
                {Object.entries(ROOM_PHASE_STEP_LABELS[phase.phase]).map(
                  ([step, label]) => (
                    <li
                      key={step}
                      aria-current={
                        Number(step) === phase.step ? "step" : undefined
                      }
                      className={
                        Number(step) === phase.step
                          ? "font-semibold text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      {label}
                    </li>
                  ),
                )}
              </ol>
            ) : null}
            <p className="mt-2 border-t border-border pt-2 text-xs">
              ゴール：
              {phase.phase === 1
                ? "課題"
                : phase.phase === 2
                  ? "HMW"
                  : "アイデア"}
              を1つ決める
            </p>
          </>
        ) : null}
      </div>

      {decisions.map(({ id, label, content }, index) => (
        <details
          key={`${phaseKey}-${id}`}
          open={phase.kind === "step" && phase.step === 1 && index === 0}
          className="group/reference border-t border-border"
          data-testid={`board-reference-${id}`}
        >
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-xs font-medium outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Check
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="flex-1">{label}</span>
            <ChevronUp
              aria-hidden="true"
              className="size-3.5 shrink-0 rotate-180 text-muted-foreground transition-transform group-open/reference:rotate-0 motion-reduce:transition-none"
            />
          </summary>
          <div
            data-testid={`board-reference-${id}-content`}
            className="max-h-24 overflow-y-auto overscroll-contain px-4 pb-3"
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-5">
              {content}
            </p>
          </div>
        </details>
      ))}
    </header>
  );
}
