"use client";

import { Check, ChevronUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    stepLabel: getPhaseLabel(phase).replace(/^\d+-\d+\s*/, ""),
  };
}

export type BoardContextProps = {
  phase: RoomPhase;
  guide: FacilitationGuideContent | null;
  isHost: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
};

export function BoardContext({
  phase,
  guide,
  isHost,
  isExpanded,
  onExpandedChange,
  hmwDecidedIssue,
  decidedHmw,
}: BoardContextProps) {
  const context = getPhaseContext(phase);
  const decisions = [
    { label: "決定した課題", content: hmwDecidedIssue },
    { label: "決定したHMW", content: decidedHmw },
  ].filter((item) => item.content !== null);
  return (
    <header
      data-testid="board-context-hud"
      className="board-hud facilitation-guide-material pointer-events-auto min-w-0 shrink-0 overflow-hidden rounded-2xl border border-border bg-background shadow-lg shadow-black/5"
    >
      <button
        type="button"
        disabled={guide === null}
        className="block w-full px-4 py-3 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`ステップの詳細を${isExpanded ? "閉じる" : "開く"}`}
        aria-describedby="board-current-phase board-current-step"
        aria-expanded={isExpanded}
        aria-controls="board-step-details"
        onClick={() => onExpandedChange(!isExpanded)}
      >
        <span id="board-current-phase" className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold">
            {context.title}
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {context.step}/{context.stepCount}
          </span>
          {guide !== null ? (
            <ChevronUp
              aria-hidden="true"
              className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${isExpanded ? "" : "rotate-180"}`}
            />
          ) : null}
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
      </button>

      {guide !== null ? (
        <div
          id="board-step-details"
          hidden={!isExpanded}
          data-testid="board-guide-region"
        >
          <Tabs
            key={
              phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"
            }
            defaultValue="guide"
            className="gap-0 border-t border-border"
          >
            {decisions.length > 0 ? (
              <TabsList
                variant="line"
                aria-label="ステップの詳細"
                className="mx-4 w-auto justify-start border-b border-border p-0 group-data-horizontal/tabs:h-9"
              >
                <TabsTrigger
                  value="guide"
                  className="h-9 flex-none rounded-none px-3 text-xs group-data-horizontal/tabs:after:bottom-0"
                >
                  進め方
                </TabsTrigger>
                <TabsTrigger
                  value="decisions"
                  className="h-9 flex-none rounded-none px-3 text-xs group-data-horizontal/tabs:after:bottom-0"
                >
                  決定事項{" "}
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {decisions.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            ) : null}
            <div
              className="max-h-56 overflow-y-auto overscroll-contain"
              data-testid="board-context-content"
            >
              <TabsContent value="guide">
                <FacilitationGuide
                  id="facilitation-guide-content"
                  guide={guide}
                  isHost={isHost}
                  isExpanded={isExpanded}
                />
              </TabsContent>
              <TabsContent value="decisions" className="px-4 py-3">
                <dl className="space-y-4">
                  {decisions.map(({ label, content }) => (
                    <div key={label}>
                      <dt className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Check aria-hidden="true" className="size-3.5" />
                        {label}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                        {content}
                      </dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      ) : null}
    </header>
  );
}
