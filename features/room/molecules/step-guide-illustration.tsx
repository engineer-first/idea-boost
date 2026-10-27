import {
  ArrowDown,
  ArrowRight,
  Clock3,
  MessageCircle,
  MousePointer2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  STEP_GUIDE_DIAGRAM_COPY as copy,
  SCAMPER_QUESTION_EXAMPLES,
  type StepGuideDiagramKind,
} from "../logic/step-guide-copy";

type StepGuideIllustrationProps = { kind: StepGuideDiagramKind; alt: string };

function Note({
  children,
  blue = false,
}: {
  children: ReactNode;
  blue?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-3 text-sm leading-6 shadow-sm ${blue ? "border-sky-200 bg-sky-100 text-slate-800" : "border-amber-200 bg-amber-100 text-slate-800"}`}
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
}: StepGuideIllustrationProps) {
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
            <span className="rounded-full border bg-background px-3 py-2 text-sm font-semibold">
              {copy.nextSpeaker}
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
            <p className="mb-3 font-semibold">{copy.subjective}</p>
            <Note>{copy.subjectiveCriterion}</Note>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="mb-3 font-semibold">{copy.objective}</p>
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
              <p className="text-sm text-red-700">{copy.subjectiveRemaining}</p>
              <p className="text-sm text-blue-700">{copy.objectiveRemaining}</p>
            </div>
            <div className="text-center text-sm">
              {copy.attach}
              <br />
              {copy.returnSticker}
            </div>
            <Note>
              <span className="block">{copy.forgotten}</span>
              <span className="mt-3 inline-block rounded-full border border-red-300 bg-red-100 px-2 text-red-800">
                {copy.subjective}
              </span>
              <span className="ml-2 inline-block border border-blue-300 bg-blue-100 px-2 text-blue-800">
                {copy.objective}
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
              <span className="mt-3 block text-xs">{copy.firstVotes}</span>
            </Note>
            <Note blue>
              {copy.morning}
              <span className="mt-3 block text-xs">{copy.secondVotes}</span>
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
        <div className="space-y-4">
          <Note>{copy.exampleIssue}</Note>
          <div className="grid gap-4 sm:grid-cols-2">
            {SCAMPER_QUESTION_EXAMPLES.map((example) => (
              <div
                key={example.perspective}
                className="min-w-0 space-y-3 rounded-xl border bg-background p-3"
              >
                <p className="font-semibold">↓ {example.perspective}</p>
                <p className="text-sm leading-6">{example.prompt}</p>
                <ArrowDown
                  aria-hidden
                  className="mx-auto size-5 text-muted-foreground"
                />
                <Note blue>{example.question}</Note>
              </div>
            ))}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
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
      className="flex min-h-48 w-full flex-col justify-center rounded-2xl bg-muted/40 p-4 sm:p-6"
    >
      {content}
    </section>
  );
}
