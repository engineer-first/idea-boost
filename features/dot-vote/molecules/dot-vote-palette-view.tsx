import { Button } from "@/components/ui/button";
import type { DotVoteKind } from "@/contracts/room-protocol";
import {
  DOT_VOTE_CRITERIA,
  DOT_VOTE_GUIDANCE,
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
  isReturnDropTarget: boolean;
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

const DOT_VOTE_BUTTON_TONE = {
  subjective:
    "border-rose-200 bg-rose-50/80 text-rose-950 hover:bg-rose-100 hover:text-rose-950 focus-visible:border-rose-600 focus-visible:ring-rose-600/50 active:bg-rose-200 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
  objective:
    "border-blue-200 bg-blue-50/80 text-blue-950 hover:bg-blue-100 hover:text-blue-950 focus-visible:border-blue-600 focus-visible:ring-blue-600/50 active:bg-blue-200 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_SELECTED_TONE = {
  subjective: "ring-2 ring-rose-700/75 ring-offset-2 ring-offset-white",
  objective: "ring-2 ring-blue-700/75 ring-offset-2 ring-offset-white",
} satisfies Record<DotVoteKind, string>;

export function DotVotePaletteView({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  selectedKind,
  isReturnDropTarget,
  onStickerSelect,
  onStickerDragStart,
}: DotVotePaletteViewProps) {
  const isComplete =
    voteRemaining.subjective === 0 && voteRemaining.objective === 0;
  const status = disabled
    ? "接続を待っています。投票の確定は接続後に確認してください。"
    : pendingOperationCount > 0
      ? "投票を送信中です。確定までお待ちください。"
      : feedback?.state === "failed"
        ? feedback.message
        : isReturnDropTarget
          ? "ここへ戻すと1票取り消しになります。"
          : isComplete
            ? "4票の配布が確定しました。付け直すこともできます。"
            : selectedKind !== null
              ? `${DOT_VOTE_LABELS[selectedKind]}シールを選択中です。付箋をクリックして連続で貼れます。`
              : feedback?.state === "confirmed"
                ? feedback.message
                : "シールを選んで付箋へ貼るか、ドラッグしてください。";

  return (
    <section
      aria-label="投票パレット"
      aria-describedby="dot-vote-palette-help"
      data-vote-palette="true"
      data-return-drop-target={isReturnDropTarget ? "true" : undefined}
      className={`pointer-events-auto relative flex w-[30rem] max-w-[calc(100vw-1.5rem)] flex-col items-stretch rounded-xl border border-border bg-white p-1 shadow-[0_4px_12px_rgba(69,54,36,0.12)] ${
        isReturnDropTarget
          ? "border-amber-500 bg-amber-50/95 ring-2 ring-amber-300/80 ring-offset-2 ring-offset-white"
          : ""
      }`}
    >
      {isReturnDropTarget ? (
        <p className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 shadow-sm">
          ここへ戻すと1票取り消しになります。
        </p>
      ) : null}
      <div id="dot-vote-palette-help" className="sr-only">
        <p className="sr-only">投票対象は現在のフェーズの個々の付箋です。</p>
        <p className="sr-only">
          シールを付箋へドラッグ、または選択して連続で貼り付け
        </p>
        <p className="sr-only">{DOT_VOTE_GUIDANCE.withdrawal}</p>
        <p className="sr-only">
          付箋に貼った自分のシールを投票パレットへ戻すと、その1票を取り消せます。
        </p>
      </div>
      <fieldset className="flex min-w-0 gap-1">
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
              className={`h-auto min-h-12 min-w-0 flex-1 touch-none cursor-grab select-none gap-1.5 rounded-lg border px-1.5 py-1.5 active:cursor-grabbing disabled:cursor-not-allowed ${DOT_VOTE_BUTTON_TONE[kind]} ${
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
                  <span className="text-xs font-semibold tabular-nums">
                    残り{voteRemaining[kind]}票
                  </span>
                </span>
                <span className="mt-0.5 whitespace-normal text-left text-xs leading-tight font-medium">
                  {DOT_VOTE_CRITERIA[kind]}
                </span>
              </span>
            </Button>
          );
        })}
      </fieldset>
      <p
        className={`px-1.5 pt-1.5 text-xs leading-relaxed break-words ${
          feedback?.state === "failed" &&
          !disabled &&
          pendingOperationCount === 0
            ? "font-semibold text-destructive"
            : "text-foreground"
        }`}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
      <details className="px-1.5 py-1 text-xs leading-relaxed text-foreground">
        <summary className="w-fit cursor-pointer rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
          貼り方・付け直し
        </summary>
        <p className="pt-1">
          シールを選び、付箋をクリックするか、付箋にフォーカスしてEnter・Spaceで貼ります。ドラッグでも貼れます。
        </p>
        <p>
          貼った自分のシールは押すと1票取消。ドラッグで別の付箋へ移動、パレットへ戻すと1票取消になります。
        </p>
        <p>
          投票中の票は本人だけに見えます。全員には配布完了だけを共有します。
        </p>
      </details>
    </section>
  );
}
