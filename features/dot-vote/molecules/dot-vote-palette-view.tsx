import { Button } from "@/components/ui/button";
import type { DotVoteKind } from "@/contracts/room-protocol";
import {
  DOT_VOTE_LABELS,
  type DotVoteFeedback,
  type DotVoteRemaining,
  dotVoteRemainingLabel,
} from "../logic/dot-vote";
import { DotVoteStickerImage } from "./dot-vote-sticker";

type DotVotePaletteViewProps = {
  voteRemaining: DotVoteRemaining;
  pendingOperationCount: number;
  feedback: DotVoteFeedback | null;
  disabled: boolean;
  onStickerDragStart: (
    kind: DotVoteKind,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

const DOT_VOTE_KINDS: readonly DotVoteKind[] = ["subjective", "objective"];

const DOT_VOTE_HINTS = {
  subjective: "直感・共感",
  objective: "根拠・比較",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_BUTTON_TONE = {
  subjective:
    "border-rose-200 bg-rose-50/80 text-rose-950 hover:bg-rose-100 focus-visible:ring-rose-600/30 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100",
  objective:
    "border-blue-200 bg-blue-50/80 text-blue-950 hover:bg-blue-100 focus-visible:ring-blue-600/30 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-100",
} satisfies Record<DotVoteKind, string>;

export function DotVotePaletteView({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  onStickerDragStart,
}: DotVotePaletteViewProps) {
  const status =
    pendingOperationCount > 0
      ? "投票を送信中です。"
      : feedback?.state === "confirmed"
        ? feedback.message
        : feedback?.state === "failed"
          ? feedback.message
          : "シールを付箋へドラッグして貼ってください。";

  return (
    <section
      aria-label="投票パレット"
      className="pointer-events-auto flex h-12 items-center rounded-xl border border-border bg-white p-1 shadow-[0_4px_12px_rgba(69,54,36,0.12)] dark:bg-slate-950"
    >
      <p className="sr-only">シールを付箋へドラッグ</p>
      <fieldset className="flex gap-1">
        <legend className="sr-only">ドラッグするシールの種類</legend>
        {DOT_VOTE_KINDS.map((kind) => {
          return (
            <Button
              key={kind}
              type="button"
              aria-label={dotVoteRemainingLabel(kind, voteRemaining[kind])}
              disabled={disabled || voteRemaining[kind] <= 0}
              size="sm"
              variant="outline"
              className={`h-10 touch-none cursor-grab select-none gap-1.5 rounded-lg border px-1.5 active:cursor-grabbing disabled:cursor-not-allowed ${DOT_VOTE_BUTTON_TONE[kind]}`}
              onPointerDown={(event) => {
                if (disabled || voteRemaining[kind] <= 0) return;
                onStickerDragStart?.(kind, event);
              }}
            >
              <DotVoteStickerImage kind={kind} />
              <span className="flex flex-col items-start leading-none">
                <span className="flex items-baseline gap-1">
                  <span className="text-xs font-bold">
                    {DOT_VOTE_LABELS[kind]}
                  </span>
                  <span className="text-[0.5rem] font-semibold tabular-nums opacity-65">
                    残り{voteRemaining[kind]}票
                  </span>
                </span>
                <span className="mt-0.5 text-[0.55rem] font-medium opacity-70">
                  {DOT_VOTE_HINTS[kind]}
                </span>
              </span>
            </Button>
          );
        })}
      </fieldset>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
