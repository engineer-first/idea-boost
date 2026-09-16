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
  selectedKind: DotVoteKind | null;
  onStickerSelect: (
    kind: DotVoteKind,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
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
    "border-rose-200 bg-rose-50/80 text-rose-950 hover:bg-rose-100 hover:text-rose-950 focus-visible:border-rose-600 focus-visible:ring-rose-600/50 active:bg-rose-200 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-100 dark:hover:bg-rose-900/80 dark:hover:text-rose-50 dark:focus-visible:border-rose-300 dark:focus-visible:ring-rose-300/70 dark:active:bg-rose-800/80 dark:disabled:border-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-400 dark:disabled:opacity-100",
  objective:
    "border-blue-200 bg-blue-50/80 text-blue-950 hover:bg-blue-100 hover:text-blue-950 focus-visible:border-blue-600 focus-visible:ring-blue-600/50 active:bg-blue-200 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-100 dark:hover:bg-blue-900/80 dark:hover:text-blue-50 dark:focus-visible:border-blue-300 dark:focus-visible:ring-blue-300/70 dark:active:bg-blue-800/80 dark:disabled:border-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-400 dark:disabled:opacity-100",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_SELECTED_TONE = {
  subjective:
    "ring-2 ring-rose-700/75 ring-offset-2 ring-offset-white dark:ring-rose-300 dark:ring-offset-slate-950",
  objective:
    "ring-2 ring-blue-700/75 ring-offset-2 ring-offset-white dark:ring-blue-300 dark:ring-offset-slate-950",
} satisfies Record<DotVoteKind, string>;

export function DotVotePaletteView({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  selectedKind,
  onStickerSelect,
  onStickerDragStart,
}: DotVotePaletteViewProps) {
  const status =
    pendingOperationCount > 0
      ? "投票を送信中です。"
      : feedback?.state === "confirmed"
        ? feedback.message
        : feedback?.state === "failed"
          ? feedback.message
          : selectedKind === null
            ? "シールをドラッグするか、クリックしてから付箋へ貼ってください。"
            : `${DOT_VOTE_LABELS[selectedKind]}シールを選択中です。付箋をクリックして連続で貼れます。`;

  return (
    <section
      aria-label="投票パレット"
      className="pointer-events-auto flex h-12 items-center rounded-xl border border-border bg-white p-1 shadow-[0_4px_12px_rgba(69,54,36,0.12)] dark:bg-slate-950"
    >
      <p className="sr-only">
        シールを付箋へドラッグ、または選択して連続で貼り付け
      </p>
      <fieldset className="flex gap-1">
        <legend className="sr-only">使用するシールの種類</legend>
        {DOT_VOTE_KINDS.map((kind) => {
          return (
            <Button
              key={kind}
              type="button"
              aria-label={dotVoteRemainingLabel(kind, voteRemaining[kind])}
              aria-pressed={selectedKind === kind}
              disabled={disabled || voteRemaining[kind] <= 0}
              size="sm"
              variant="outline"
              className={`h-10 touch-none cursor-grab select-none gap-1.5 rounded-lg border px-1.5 active:cursor-grabbing disabled:cursor-not-allowed ${DOT_VOTE_BUTTON_TONE[kind]} ${
                selectedKind === kind ? DOT_VOTE_SELECTED_TONE[kind] : ""
              }`}
              onClick={(event) => {
                if (disabled || voteRemaining[kind] <= 0) return;
                onStickerSelect(kind, event);
              }}
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
