"use client";

import { Check, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { PHASE_STEP_COUNTS, type RoomPhase } from "@/contracts/phase";
import {
  getPhaseLabel,
  getPhaseProgressState,
  getPhaseTitle,
  PHASE_LABELS,
  PHASE_NUMBERS,
} from "../logic/phase-labels";
import styles from "./board-context.module.css";

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
  onOpenFeedback?: () => void;
};

export function BoardContext({
  phase,
  hmwDecidedIssue,
  decidedHmw,
  onOpenFeedback,
}: BoardContextProps) {
  const context = getPhaseContext(phase);
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [openState, setOpenState] = useState<{
    phaseKey: string;
    id: string | null;
  }>({ phaseKey, id: null });
  const openDisclosureId =
    openState.phaseKey === phaseKey ? openState.id : null;
  const id = useId();

  const disclosures: {
    id: string;
    label: string;
    content: ReactNode;
  }[] = [];

  const decisions = [
    { id: "hmw", label: "決定したHMW", content: decidedHmw },
    { id: "issue", label: "決定した課題", content: hmwDecidedIssue },
  ].filter((item) => item.content !== null);

  for (const decision of decisions) {
    disclosures.push({
      id: decision.id,
      label: decision.label,
      content: (
        <div
          data-testid={`board-reference-${decision.id}-content`}
          className="max-h-24 overflow-y-auto overscroll-contain px-4 py-2"
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-5">
            {decision.content}
          </p>
        </div>
      ),
    });
  }

  return (
    <header
      data-testid="board-context-hud"
      className="board-hud facilitation-guide-material pointer-events-auto min-w-0 shrink-0 overflow-hidden rounded-2xl border border-border bg-background shadow-lg shadow-black/5"
    >
      <nav
        aria-label="アイデア出しのフェーズ進行"
        data-testid="board-phase-progress"
        className="border-b border-border px-3 py-2 sm:px-4 max-[639px]:py-1"
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
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-center text-[10px] leading-4 sm:gap-1.5 sm:px-1.5 sm:text-xs max-[639px]:flex-row ${labelClassName}`}
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

      <div className="px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            id="board-current-step"
            data-testid="board-current-step"
            className="min-w-0 flex-1 text-sm leading-5 font-semibold"
          >
            {context.stepLabel}
          </span>
          {onOpenFeedback ? (
            <button
              type="button"
              aria-label="フィードバック"
              title="フィードバック"
              onClick={onOpenFeedback}
              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <MessageSquare aria-hidden="true" className="size-4" />
              <span className="whitespace-nowrap">フィードバック</span>
            </button>
          ) : null}
        </div>
        <span
          role="progressbar"
          aria-label={`${context.title}の進行状況`}
          aria-valuemin={0}
          aria-valuemax={context.stepCount}
          aria-valuenow={context.step}
          className="mt-1.5 flex h-0.5 w-full gap-1"
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
      </div>

      {disclosures.map((disclosure) => {
        const isOpen = openDisclosureId === disclosure.id;
        const triggerId = `${id}-${disclosure.id}-trigger`;
        const contentId = `${id}-${disclosure.id}-content`;

        return (
          <section
            key={disclosure.id}
            className="border-t border-border"
            data-testid={
              disclosure.id === "hmw" || disclosure.id === "issue"
                ? `board-reference-${disclosure.id}`
                : `board-context-${disclosure.id}`
            }
            data-open={isOpen}
          >
            <button
              id={triggerId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={contentId}
              className="flex min-h-8 w-full cursor-pointer items-center gap-1.5 px-4 py-1.5 text-left text-xs font-medium outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() =>
                setOpenState({
                  phaseKey,
                  id: isOpen ? null : disclosure.id,
                })
              }
            >
              {disclosure.id === "hmw" || disclosure.id === "issue" ? (
                <Check
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : null}
              <span className="flex-1">{disclosure.label}</span>
              <ChevronDown
                aria-hidden="true"
                className={`size-3.5 shrink-0 text-muted-foreground ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <section
              id={contentId}
              aria-labelledby={triggerId}
              aria-hidden={!isOpen}
              inert={!isOpen}
              hidden={!isOpen}
              data-open={isOpen}
              className={styles.disclosure}
            >
              <div className={styles.disclosureInner}>{disclosure.content}</div>
            </section>
          </section>
        );
      })}
    </header>
  );
}
