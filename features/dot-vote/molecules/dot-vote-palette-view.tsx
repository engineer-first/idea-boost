import { ArrowRight, Check, Circle, Clock3, StickyNote } from "lucide-react";
import { useId } from "react";
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
  const paletteId = useId();
  const activeSelectedKind =
    selectedKind !== null && voteRemaining[selectedKind] > 0 && !disabled
      ? selectedKind
      : null;
  const status = disabled
    ? "再接続を待っています。接続後に残票を確認してください。"
    : pendingOperationCount > 0
      ? "投票を送信中です。残票は確認待ちです。"
      : feedback?.state === "confirmed"
        ? feedback.message
        : feedback?.state === "failed"
          ? feedback.message
          : isReturnDropTarget
            ? "ここへ戻すと1票取り消しになります。"
            : voteRemaining.subjective === 0 && voteRemaining.objective === 0
              ? "すべてのシールを使い切りました。"
              : activeSelectedKind === null
                ? "シールをドラッグするか、クリックしてから付箋へ貼ってください。"
                : `${DOT_VOTE_LABELS[activeSelectedKind]}シールを選択中です。付箋をクリックして連続で貼れます。`;

  return (
    <section
      aria-label="投票パレット"
      aria-describedby={`${paletteId}-help`}
      data-vote-palette="true"
      data-return-drop-target={isReturnDropTarget ? "true" : undefined}
      className={`pointer-events-auto relative flex w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-xl border border-border bg-white p-2 shadow-[0_4px_12px_rgba(69,54,36,0.12)] ${
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
      <div id={`${paletteId}-help`} className="sr-only">
        <p className="sr-only">投票対象は現在のフェーズの個々の付箋です。</p>
        <p className="sr-only">{DOT_VOTE_GUIDANCE.withdrawal}</p>
        <p className="sr-only">
          付箋に貼った自分のシールを投票パレットへ戻すと、その1票を取り消せます。
        </p>
      </div>
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-medium text-slate-700">
        <Circle aria-hidden="true" className="size-3.5" />
        <span>シールを選ぶ</span>
        <ArrowRight aria-hidden="true" className="size-3.5" />
        <StickyNote aria-hidden="true" className="size-3.5" />
        <span>付箋へ貼る</span>
        <span>（ドラッグも可）</span>
      </p>
      <fieldset className="flex w-full min-w-0 gap-2">
        <legend className="sr-only">使用するシールの種類</legend>
        {DOT_VOTE_KINDS.map((kind) => {
          const isEmpty = voteRemaining[kind] <= 0;
          const isWaiting = isEmpty && (pendingOperationCount > 0 || disabled);
          const isExhausted = isEmpty && !isWaiting;
          const isSelected = activeSelectedKind === kind;
          const stateLabel = disabled
            ? "接続待ち"
            : isWaiting
              ? "確認待ち"
              : isExhausted
                ? "使い切りました"
                : isSelected
                  ? "選択中"
                  : "選んで貼る";
          return (
            <Button
              key={kind}
              type="button"
              aria-label={dotVoteRemainingLabel(kind, voteRemaining[kind])}
              aria-pressed={isSelected}
              aria-describedby={`${paletteId}-${kind}-state`}
              disabled={disabled || voteRemaining[kind] <= 0}
              size="sm"
              variant="outline"
              className={`h-auto min-w-0 flex-1 touch-none cursor-grab select-none flex-col items-stretch gap-1 rounded-lg border p-2 active:cursor-grabbing disabled:cursor-not-allowed ${isExhausted ? "min-h-20 border-dashed" : "min-h-24"} ${DOT_VOTE_BUTTON_TONE[kind]} ${
                isSelected ? DOT_VOTE_SELECTED_TONE[kind] : ""
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
              <span className="flex items-center gap-1.5">
                <span
                  className={
                    isEmpty || disabled ? "opacity-50 grayscale" : undefined
                  }
                >
                  <DotVoteStickerImage kind={kind} />
                </span>
                <span className="text-sm font-bold">
                  {DOT_VOTE_LABELS[kind]}
                </span>
                <span className="ml-auto text-sm font-bold tabular-nums">
                  残り{voteRemaining[kind]}票
                </span>
              </span>
              {!isExhausted ? (
                <span className="whitespace-normal text-left text-xs font-semibold leading-snug">
                  {DOT_VOTE_CRITERIA[kind]}
                </span>
              ) : null}
              <span
                id={`${paletteId}-${kind}-state`}
                className="mt-auto flex items-center justify-center gap-1 text-xs font-semibold"
              >
                {isWaiting ? (
                  <Clock3 aria-hidden="true" className="size-3.5" />
                ) : null}
                {isExhausted || isSelected ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : null}
                {stateLabel}
              </span>
            </Button>
          );
        })}
      </fieldset>
      <p
        className="w-full text-xs leading-snug text-slate-700"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </section>
  );
}
