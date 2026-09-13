"use client";

import { Check, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PHASE_STEP_COUNTS, type RoomPhase } from "@/contracts/phase";
import type { FacilitationGuideContent } from "../logic/facilitation-guide";
import { getPhaseLabel } from "../logic/phase-labels";
import { FacilitationGuide } from "./facilitation-guide";

const PHASE_TITLES = {
  1: "課題整理",
  2: "問いの作成",
  3: "アイデア",
} as const;

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
    title: PHASE_TITLES[phase.phase],
    step: phase.step,
    stepCount: PHASE_STEP_COUNTS[phase.phase],
    stepLabel:
      phase.phase === 2 && phase.step === 1
        ? "問いをつくる"
        : getPhaseLabel(phase).replace(/^\d+-\d+\s*/, ""),
  };
}

function getStepDisplayTitle(phase: RoomPhase, fallback: string): string {
  return phase.kind === "step" && phase.phase === 2 && phase.step === 1
    ? "問いをつくる"
    : fallback;
}

export type BoardContextProps = {
  phase: RoomPhase;
  guide: FacilitationGuideContent | null;
  isHost: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  onPrimaryAction?: () => void;
};

export function BoardContext({
  phase,
  guide,
  isHost,
  isExpanded,
  onExpandedChange,
  hmwDecidedIssue,
  decidedHmw,
  onPrimaryAction,
}: BoardContextProps) {
  const context = getPhaseContext(phase);
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
      <div className="px-4 py-3">
        <span id="board-current-phase" className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold">
            {context.title}
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {context.step}/{context.stepCount}
          </span>
        </span>
        <span
          id="board-current-step"
          className="mt-1 block text-xs leading-4 text-muted-foreground"
        >
          {context.stepLabel}
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
      </div>

      {guide !== null ? (
        <section className="border-t border-border" aria-label="進め方">
          <button
            type="button"
            className="flex h-8 w-full items-center justify-between px-4 text-xs font-medium text-muted-foreground outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`進め方を${isExpanded ? "閉じる" : "開く"}`}
            aria-expanded={isExpanded}
            aria-controls={
              onPrimaryAction ? "board-step-dialog" : "board-step-details"
            }
            onClick={() => onExpandedChange(!isExpanded)}
          >
            やり方
            <ChevronUp
              aria-hidden="true"
              className={`size-3.5 transition-transform motion-reduce:transition-none ${isExpanded ? "" : "rotate-180"}`}
            />
          </button>
          {onPrimaryAction === undefined ? (
            <div
              id="board-step-details"
              hidden={!isExpanded}
              data-testid="board-guide-region"
              className="max-h-28 overflow-y-auto overscroll-contain"
            >
              <FacilitationGuide
                id="facilitation-guide-content"
                guide={guide}
                isHost={isHost}
                isExpanded={isExpanded}
              />
            </div>
          ) : null}
        </section>
      ) : null}
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
      {guide !== null && onPrimaryAction !== undefined ? (
        <Dialog open={isExpanded} onOpenChange={onExpandedChange} modal={false}>
          <DialogContent
            id="board-step-dialog"
            className="max-h-[min(42rem,calc(100vh-2rem))] max-w-xl overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>
                {getStepDisplayTitle(phase, context.stepLabel)}
              </DialogTitle>
              <DialogDescription>
                {guide.purpose ?? guide.message}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="mb-2 font-semibold">やること</h3>
                <ol className="list-decimal space-y-1.5 pl-5">
                  {(guide.steps ?? [guide.message]).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
              {guide.example ? (
                <section>
                  <h3 className="mb-2 font-semibold">具体例</h3>
                  <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 leading-6">
                    {guide.example}
                  </p>
                </section>
              ) : null}
              <section>
                <h3 className="mb-1 font-semibold">完了の目安</h3>
                <p className="text-muted-foreground">
                  {guide.completion ??
                    "このステップの作業が終わったら完了です。"}
                </p>
              </section>
              {isHost && guide.hostMessage !== null ? (
                <section className="rounded-lg border border-border bg-muted/60 p-3">
                  <h3 className="text-xs font-semibold">進行役へ</h3>
                  <p className="mt-1 text-sm leading-5">{guide.hostMessage}</p>
                </section>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={onPrimaryAction ?? (() => onExpandedChange(false))}
              >
                {phase.kind === "step" && phase.step === 1
                  ? phase.phase === 1
                    ? "最初の課題を書く"
                    : phase.phase === 2
                      ? "最初の問いを書く"
                      : "最初のアイデアを書く"
                  : "このステップを始める"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </header>
  );
}
