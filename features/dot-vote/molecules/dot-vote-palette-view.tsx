import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DOT_VOTE_LIMITS, type DotVoteKind } from "@/contracts/room-protocol";
import {
  DOT_VOTE_GUIDANCE,
  DOT_VOTE_KIND_TAGS,
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
  // 使い切った種類のタイルを押すと、その種類の自分の票をすべて取り消す。
  onWithdrawAll: (kind: DotVoteKind) => void;
};

const DOT_VOTE_KINDS: readonly DotVoteKind[] = ["subjective", "objective"];

// 枠は種類の色で常に示し、押せる面であることと種類の違いを伝える。
const DOT_VOTE_BUTTON_TONE = {
  subjective:
    "border-vote-subjective bg-white text-foreground hover:bg-vote-subjective-soft/40 hover:text-foreground focus-visible:border-vote-subjective focus-visible:ring-vote-subjective/50 active:bg-vote-subjective-soft disabled:opacity-100",
  objective:
    "border-vote-objective bg-white text-foreground hover:bg-vote-objective-soft/40 hover:text-foreground focus-visible:border-vote-objective focus-visible:ring-vote-objective/50 active:bg-vote-objective-soft disabled:opacity-100",
} satisfies Record<DotVoteKind, string>;

// 接続待ち・確認待ち・使い切りは灰色にする。使い切りは全取り消しのために押せる。
const DOT_VOTE_UNAVAILABLE_TONE =
  "border-line-strong bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground focus-visible:border-line-strong focus-visible:ring-ring/50 active:bg-muted";

// 選択中は種類の色の薄い面で示す。
const DOT_VOTE_SELECTED_TONE = {
  subjective:
    "border-vote-subjective bg-vote-subjective-soft text-vote-subjective-text hover:bg-vote-subjective-soft hover:text-vote-subjective-text",
  objective:
    "border-vote-objective bg-vote-objective-soft text-vote-objective-text hover:bg-vote-objective-soft hover:text-vote-objective-text",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_TAG_TONE = {
  subjective: "bg-vote-subjective",
  objective: "bg-vote-objective",
} satisfies Record<DotVoteKind, string>;

// 残票の点はシールと同じ形にする。残っている票は塗り、使った票は中抜きの枠。
const DOT_VOTE_PIP_TONE = {
  subjective: {
    shape: "rounded-full",
    line: "border-vote-subjective",
    fill: "bg-vote-subjective",
  },
  objective: {
    shape: "rounded-[3px]",
    line: "border-vote-objective",
    fill: "bg-vote-objective",
  },
} satisfies Record<DotVoteKind, { shape: string; line: string; fill: string }>;

function DotVoteRemainingPips({
  kind,
  remaining,
  muted,
}: {
  kind: DotVoteKind;
  remaining: number;
  muted: boolean;
}) {
  const tone = DOT_VOTE_PIP_TONE[kind];
  return (
    <span aria-hidden="true" className="flex h-4 items-center gap-1.5">
      {Array.from({ length: DOT_VOTE_LIMITS[kind] }, (_, index) => index).map(
        (index) => {
          const isRemaining = index < remaining;
          return (
            <span
              key={`${kind}-pip-${index}`}
              data-testid={`dot-vote-remaining-pip-${kind}`}
              data-state={isRemaining ? "remaining" : "used"}
              className={`size-3 border-2 ${tone.shape} ${
                muted ? "border-muted-foreground" : tone.line
              } ${
                isRemaining
                  ? muted
                    ? "bg-muted-foreground"
                    : tone.fill
                  : "bg-transparent"
              }`}
            />
          );
        },
      )}
    </span>
  );
}

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
  onWithdrawAll,
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
      <fieldset className="grid w-full min-w-0 grid-cols-2 gap-2">
        <legend className="sr-only">使用するシールの種類</legend>
        {DOT_VOTE_KINDS.map((kind) => {
          const isEmpty = voteRemaining[kind] <= 0;
          const isWaiting = isEmpty && (pendingOperationCount > 0 || disabled);
          const isExhausted = isEmpty && !isWaiting;
          const isSelected = activeSelectedKind === kind;
          const canWithdrawAll =
            isExhausted && !disabled && !interactionBlocked;
          const canPlace =
            !disabled && !interactionBlocked && voteRemaining[kind] > 0;
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
              aria-describedby={
                canWithdrawAll
                  ? `${paletteId}-${kind}-state ${paletteId}-${kind}-withdraw`
                  : `${paletteId}-${kind}-state`
              }
              disabled={!canPlace && !canWithdrawAll}
              size="sm"
              variant="outline"
              className={`relative h-auto min-w-0 touch-none cursor-grab select-none flex-col items-center gap-1.5 whitespace-normal rounded-xl border-2 px-2 pt-3.5 pb-3 active:cursor-grabbing disabled:cursor-not-allowed ${isExhausted ? "cursor-pointer border-dashed active:cursor-pointer" : ""} ${DOT_VOTE_BUTTON_TONE[kind]} ${isEmpty || disabled ? DOT_VOTE_UNAVAILABLE_TONE : ""} ${
                isSelected ? DOT_VOTE_SELECTED_TONE[kind] : ""
              }`}
              onClick={(event) => {
                if (canWithdrawAll) {
                  onWithdrawAll(kind);
                  return;
                }
                if (!canPlace) return;
                onStickerSelect(kind, event);
              }}
              onPointerDown={(event) => {
                if (!canPlace) return;
                onStickerDragStart(kind, event);
              }}
            >
              <span
                className={`absolute top-1.5 left-1.5 rounded-md px-1.5 py-1 text-xs leading-none font-bold text-white ${
                  isEmpty || disabled
                    ? "bg-muted-foreground"
                    : DOT_VOTE_TAG_TONE[kind]
                }`}
              >
                {DOT_VOTE_KIND_TAGS[kind]}
              </span>
              <span
                className={
                  isEmpty || disabled ? "opacity-45 grayscale" : undefined
                }
              >
                <DotVoteStickerImage kind={kind} size="palette" />
              </span>
              <span className="text-center text-sm leading-snug font-bold">
                {DOT_VOTE_LABELS[kind]}
              </span>
              {showsSpinner ? (
                <span aria-hidden="true" className="flex h-4 items-center">
                  <Spinner />
                </span>
              ) : (
                <DotVoteRemainingPips
                  kind={kind}
                  remaining={voteRemaining[kind]}
                  muted={isEmpty}
                />
              )}
              <span id={`${paletteId}-${kind}-state`} className="sr-only">
                {stateLabel}
              </span>
              {canWithdrawAll ? (
                <span id={`${paletteId}-${kind}-withdraw`} className="sr-only">
                  押すと、この種類の自分の票をすべて取り消します。
                </span>
              ) : null}
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
