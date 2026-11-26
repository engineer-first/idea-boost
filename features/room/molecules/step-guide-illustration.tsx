"use client";

import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  MessageCircle,
  MousePointer2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DotVoteKind } from "@/contracts/room-protocol";
import { type DotVotePhase, DotVoteStickerImage } from "@/features/dot-vote";
import {
  STEP_GUIDE_DIAGRAM_COPY,
  SCAMPER_QUESTION_EXAMPLES,
  type StepGuideDiagramKind,
  stepGuideVoteDiagramCopy,
} from "../logic/step-guide-copy";

// 記号の文字でなく、ボードと同じシールの絵を添えて種類を示す。
function StickerLabel({
  kind,
  children,
  className = "",
}: {
  kind: DotVoteKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-2 ${className}`}>
      <DotVoteStickerImage kind={kind} size="result" />
      <span>{children}</span>
    </p>
  );
}

type StepGuideIllustrationProps = {
  kind: StepGuideDiagramKind;
  alt: string;
  // 図に出すシールの名前のフェーズ。課題・問いは「いいね」、アイデアは「需要ありそう」。
  votePhase?: DotVotePhase;
};

// 狭い列でも「だろ／う？」のように語の途中で折り返さない（Chromium 系で有効）。
function Note({
  children,
  blue = false,
}: {
  children: ReactNode;
  blue?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-3 text-sm leading-6 shadow-sm [word-break:auto-phrase] ${blue ? "border-sky-200 bg-sky-100 text-slate-800" : "border-amber-200 bg-amber-100 text-slate-800"}`}
    >
      {children}
    </div>
  );
}

function Flow({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <>
      <ArrowRight
        aria-hidden
        className="hidden size-6 justify-self-center text-muted-foreground sm:block"
      />
      <ArrowDown
        aria-hidden
        className="size-5 justify-self-center text-muted-foreground sm:hidden"
      />
    </>
  );
}

// 案内内の図解のみ。ボードのイベント・共有状態へは接続しない。
export function StepGuideIllustration({
  kind,
  alt,
  votePhase = 1,
}: StepGuideIllustrationProps) {
  const locale = useLocale();
  const t = useTranslations("app.stepGuide");
  const copy =
    locale === "en"
      ? (t.raw("diagrams") as typeof STEP_GUIDE_DIAGRAM_COPY)
      : STEP_GUIDE_DIAGRAM_COPY;
  const scamperExamples =
    locale === "en"
      ? (t.raw("scamperExamples") as typeof SCAMPER_QUESTION_EXAMPLES)
      : SCAMPER_QUESTION_EXAMPLES;
  const voteCopy =
    locale === "en"
      ? {
          subjective: "Top pick!",
          objective: votePhase === 3 ? "High potential" : "Like",
          subjectiveRemaining: "Top pick! · 1 vote left",
          objectiveRemaining: `${votePhase === 3 ? "High potential" : "Like"} · 3 votes left`,
          firstVotes: "Top pick: 2 · Potential: 1",
          secondVotes: "Top pick: 1 · Potential: 2",
        }
      : stepGuideVoteDiagramCopy(votePhase);
  let content: ReactNode;
  switch (kind) {
    case "timer":
      content = (
        <Flow>
          <div className="flex flex-col items-center gap-2">
            <Clock3 aria-hidden className="size-16 text-primary" />
            <span className="font-semibold">{copy.timer}</span>
          </div>
          <Arrow />
          <div className="flex items-center gap-3">
            <Users aria-hidden className="size-8 shrink-0 text-primary" />
            <Note>{copy.timeRule}</Note>
          </div>
        </Flow>
      );
      break;
    case "share-purpose":
      content = (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Users aria-hidden />
            <span className="font-semibold">{copy.exchange}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Note>{copy.morning}</Note>
            <Note blue>{copy.forgotten}</Note>
            <Note>{copy.tidying}</Note>
          </div>
        </div>
      );
      break;
    case "share":
      content = (
        <div className="space-y-4">
          <Flow>
            <div className="rounded-xl border bg-background p-3">
              <p className="mb-2 text-sm font-semibold">{copy.privateNotes}</p>
              <Note>{copy.forgotten}</Note>
            </div>
            <div className="text-center text-sm">
              <MousePointer2 aria-hidden className="mx-auto" />
              {copy.drag}
            </div>
            <div className="rounded-xl border-2 border-dashed p-3">
              <p className="mb-2 text-sm font-semibold">{copy.share}</p>
              <Note>{copy.forgotten}</Note>
            </div>
          </Flow>
          <div className="flex items-center justify-center gap-2">
            <MessageCircle aria-hidden />
            <span>{copy.afterExplanation}</span>
            <span className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold">
              <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
              {copy.handOffButton}
            </span>
          </div>
        </div>
      );
      break;
    case "group-purpose":
    case "group":
      content = (
        <Flow>
          <div className="space-y-4">
            <Note>{copy.forgotten}</Note>
            <div className="ml-8">
              <Note blue>{copy.check}</Note>
            </div>
            <Note>{copy.tidying}</Note>
          </div>
          <Arrow />
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border-2 border-dashed border-primary/40 p-3">
              <p className="text-sm font-semibold">{copy.belongingsGroup}</p>
              <Note>{copy.forgotten}</Note>
              <Note blue>{copy.check}</Note>
            </div>
            <Note>{copy.tidying}</Note>
          </div>
        </Flow>
      );
      break;
    case "vote-purpose":
      content = (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <StickerLabel kind="subjective" className="mb-3 font-semibold">
              {voteCopy.subjective}
            </StickerLabel>
            <Note>{copy.subjectiveCriterion}</Note>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <StickerLabel kind="objective" className="mb-3 font-semibold">
              {voteCopy.objective}
            </StickerLabel>
            <Note blue>{copy.objectiveCriterion}</Note>
          </div>
        </div>
      );
      break;
    case "vote":
      content = (
        <div className="space-y-4">
          <Flow>
            <div className="space-y-3 rounded-xl border bg-background p-4">
              <p className="font-semibold">{copy.palette}</p>
              <StickerLabel kind="subjective" className="text-sm">
                {voteCopy.subjectiveRemaining}
              </StickerLabel>
              <StickerLabel kind="objective" className="text-sm">
                {voteCopy.objectiveRemaining}
              </StickerLabel>
            </div>
            <div className="text-center text-sm">
              {copy.attach}
              <br />
              {copy.returnSticker}
            </div>
            <Note>
              <span className="block">{copy.forgotten}</span>
              <span className="mt-3 flex gap-1.5">
                <DotVoteStickerImage kind="subjective" />
                <DotVoteStickerImage kind="objective" />
              </span>
            </Note>
          </Flow>
          <p className="text-center text-sm">{copy.cancelVote}</p>
        </div>
      );
      break;
    case "decision-purpose":
    case "decision":
      content = (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Note>
              {copy.forgotten}
              <span className="mt-3 block text-xs">{voteCopy.firstVotes}</span>
            </Note>
            <Note blue>
              {copy.morning}
              <span className="mt-3 block text-xs">{voteCopy.secondVotes}</span>
            </Note>
          </div>
          {kind === "decision" ? (
            <Flow>
              <div className="rounded-full border bg-background p-3 text-center text-sm font-semibold">
                {copy.startDecision}
              </div>
              <Arrow />
              <div className="rounded-xl border-2 border-primary p-3">
                <p className="mb-2 text-sm font-semibold">{copy.selectNote}</p>
                <Note blue>{copy.morning}</Note>
              </div>
            </Flow>
          ) : (
            <p className="flex items-center justify-center gap-2">
              <MessageCircle aria-hidden />
              {copy.discuss}
            </p>
          )}
        </div>
      );
      break;
    case "question-purpose":
      content = (
        <Flow>
          <Note>{copy.decidedIssue}</Note>
          <Arrow />
          <Note blue>{copy.questionTemplate}</Note>
        </Flow>
      );
      break;
    case "question-example":
      content = (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{copy.exampleIssue}</p>
          <div className="grid gap-2">
            {scamperExamples.map((example) => (
              <div
                key={example.perspective}
                className="grid min-w-0 items-center gap-3 rounded-xl border bg-background p-2 sm:grid-cols-2"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {example.perspective} →
                  </p>
                  <p className="text-sm leading-5 [word-break:auto-phrase]">
                    {example.prompt}
                  </p>
                </div>
                <Note blue>{example.question}</Note>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {copy.scamper}
          </p>
        </div>
      );
      break;
    case "solution-purpose":
      content = (
        <Flow>
          <Note blue>{copy.decidedQuestion}</Note>
          <Arrow />
          <div className="grid grid-cols-2 gap-3">
            <Note>{copy.solutionA}</Note>
            <Note>{copy.solutionB}</Note>
          </div>
        </Flow>
      );
      break;
    case "solution-example":
      content = (
        <Flow>
          <Note blue>{copy.exampleQuestion}</Note>
          <Arrow />
          <Note>
            <span className="mb-2 block text-xs font-semibold">
              {copy.solutionExampleLabel}
            </span>
            {copy.exampleSolution}
          </Note>
        </Flow>
      );
      break;
    case "evaluation-purpose":
      content = (
        <Flow>
          <Note>{copy.solution}</Note>
          <Arrow />
          <div className="space-y-3">
            <Note blue>{copy.valueQuestion}</Note>
            <Note blue>{copy.feasibilityQuestion}</Note>
          </div>
        </Flow>
      );
      break;
    case "evaluation":
      content = (
        <div className="mx-auto w-full max-w-lg">
          <p className="mb-3 text-center text-sm font-semibold">
            {copy.valueAxis}
          </p>
          <div className="relative grid min-h-48 grid-cols-2 grid-rows-2 gap-3 border-b-2 border-l-2 border-foreground/60 p-3">
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            <div className="relative col-start-2">
              <Note>{copy.solutionA}</Note>
            </div>
            <div className="relative row-start-2">
              <Note blue>{copy.solutionB}</Note>
            </div>
            <p className="relative col-start-2 row-start-2 self-center text-sm">
              {copy.reposition}
            </p>
          </div>
          <p className="mt-3 text-right text-sm font-semibold">
            {copy.feasibilityAxis}
          </p>
        </div>
      );
      break;
    default:
      return null;
  }
  return (
    <section
      aria-label={alt}
      className={`flex min-h-48 w-full flex-col justify-center rounded-2xl bg-muted/40 ${kind === "question-example" ? "p-3" : "p-4 sm:p-6"}`}
    >
      {content}
    </section>
  );
}
