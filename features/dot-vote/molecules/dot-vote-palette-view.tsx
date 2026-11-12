import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DotVoteKind } from "@/contracts/room-protocol";
import {
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
  interactionBlocked?: boolean;
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
    "border-vote-subjective/25 bg-vote-subjective-soft/40 text-vote-subjective-text hover:bg-vote-subjective-soft hover:text-vote-subjective-text focus-visible:border-vote-subjective focus-visible:ring-vote-subjective/50 active:bg-vote-subjective/20 disabled:opacity-100",
  objective:
    "border-vote-objective/25 bg-vote-objective-soft/40 text-vote-objective-text hover:bg-vote-objective-soft hover:text-vote-objective-text focus-visible:border-vote-objective focus-visible:ring-vote-objective/50 active:bg-vote-objective/20 disabled:opacity-100",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_UNAVAILABLE_TONE =
  "disabled:border-line-strong disabled:bg-muted disabled:text-muted-foreground";

const DOT_VOTE_SELECTED_TONE = {
  subjective:
    "ring-2 ring-vote-subjective/75 ring-offset-2 ring-offset-background",
  objective:
    "ring-2 ring-vote-objective/75 ring-offset-2 ring-offset-background",
} satisfies Record<DotVoteKind, string>;

export function DotVotePaletteView({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  interactionBlocked = false,
  selectedKind,
  isReturnDropTarget,
  onStickerSelect,
  onStickerDragStart,
}: DotVotePaletteViewProps) {
  const paletteId = useId();
  const activeSelectedKind =
    selectedKind !== null &&
    voteRemaining[selectedKind] > 0 &&
    !disabled &&
    !interactionBlocked
      ? selectedKind
      : null;
  const failureMessage = feedback?.state === "failed" ? feedback.message : null;

  return (
    <section
      aria-label="投票パレット"
      aria-describedby={`${paletteId}-help`}
      data-vote-palette="true"
      data-return-drop-target={isReturnDropTarget ? "true" : undefined}
      className={`pointer-events-auto relative flex w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-lg border border-border p-2 shadow-tool ${
        isReturnDropTarget
          ? "bg-primary/5 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
          : "bg-white"
      }`}
    >
      <div id={`${paletteId}-help`} className="sr-only">
        <p className="sr-only">投票対象は現在のフェーズの個々の付箋です。</p>
        <p className="sr-only">{DOT_VOTE_GUIDANCE.withdrawal}</p>
        <p className="sr-only">
          付箋に貼った自分のシールを投票パレットへ戻すと、その1票を取り消せます。
        </p>
      </div>
      <fieldset className="flex w-full min-w-0 gap-2">
        <legend className="sr-only">使用するシールの種類</legend>
        {DOT_VOTE_KINDS.map((kind) => {
          const isEmpty = voteRemaining[kind] <= 0;
          const isWaiting = isEmpty && (pendingOperationCount > 0 || disabled);
          const isExhausted = isEmpty && !isWaiting;
          const isSelected = activeSelectedKind === kind;
          // 残票が確定しない間は、票数の代わりにスピナーを出す。
          const showsSpinner = isWaiting || disabled;
          // 状態は形（輪郭・破線・灰色・スピナー）で示し、文言は読み上げだけに残す。
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
              disabled={
                disabled || interactionBlocked || voteRemaining[kind] <= 0
              }
              size="sm"
              variant="outline"
              className={`h-auto min-w-0 flex-1 touch-none cursor-grab select-none flex-col items-stretch gap-1 rounded-lg border p-2 active:cursor-grabbing disabled:cursor-not-allowed ${isExhausted ? "border-dashed" : ""} ${DOT_VOTE_BUTTON_TONE[kind]} ${isEmpty || disabled ? DOT_VOTE_UNAVAILABLE_TONE : ""} ${
                isSelected ? DOT_VOTE_SELECTED_TONE[kind] : ""
              }`}
              onClick={(event) => {
                if (disabled || interactionBlocked || voteRemaining[kind] <= 0)
                  return;
                onStickerSelect(kind, event);
              }}
              onPointerDown={(event) => {
                if (disabled || interactionBlocked || voteRemaining[kind] <= 0)
                  return;
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
                {showsSpinner ? (
                  <Spinner className="ml-auto" />
                ) : (
                  <span className="ml-auto text-sm font-bold tabular-nums">
                    残り{voteRemaining[kind]}票
                  </span>
                )}
              </span>
              <span id={`${paletteId}-${kind}-state`} className="sr-only">
                {stateLabel}
              </span>
            </Button>
          );
        })}
      </fieldset>
      {/* 失敗だけを表示する。空でも読み上げ領域は残し、失敗を確実に読み上げる。 */}
      <p
        className={
          failureMessage === null
            ? "sr-only"
            : "w-full text-xs leading-snug text-foreground"
        }
        role="status"
        aria-live="polite"
      >
        {failureMessage}
      </p>
    </section>
  );
}
