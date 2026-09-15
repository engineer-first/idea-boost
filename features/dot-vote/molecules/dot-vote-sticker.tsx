import { Heart, Scale } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { DotVoteKind } from "@/contracts/room-protocol";
import { DOT_VOTE_LABELS } from "../logic/dot-vote";

export type DotVoteStickerState =
  | "preview"
  | "pending"
  | "confirmed"
  | "result";

type DotVoteStickerProps = {
  kind: DotVoteKind;
  count: number;
  state: DotVoteStickerState;
  onRemove?: () => void;
  onDragStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

const DOT_VOTE_ICON = {
  subjective: Heart,
  objective: Scale,
} satisfies Record<DotVoteKind, typeof Heart>;

const DOT_VOTE_TONE = {
  subjective:
    "rounded-full border-rose-700 bg-rose-100 text-rose-700 dark:border-rose-400 dark:bg-rose-950 dark:text-rose-300",
  objective:
    "rounded-lg border-blue-700 bg-blue-100 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_COUNT_TONE = {
  subjective: "border-rose-700/35 text-rose-800",
  objective: "border-blue-700/35 text-blue-800",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_SHAPE = {
  subjective: "rounded-full",
  objective: "rounded-lg",
} satisfies Record<DotVoteKind, string>;

function stickerLabel(kind: DotVoteKind, count: number): string {
  return `${DOT_VOTE_LABELS[kind]}シール ${count}票`;
}

function displayCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function DotVoteStickerImage({ kind }: { kind: DotVoteKind }) {
  const Icon = DOT_VOTE_ICON[kind];
  return (
    <span
      aria-hidden="true"
      data-testid={`dot-vote-sticker-image-${kind}`}
      className={`flex size-7 shrink-0 items-center justify-center border-2 shadow-[0_2px_5px_rgba(0,0,0,0.14)] ${DOT_VOTE_TONE[kind]}`}
    >
      <Icon
        data-testid={`dot-vote-sticker-icon-${kind}`}
        className="size-4"
        fill={kind === "subjective" ? "currentColor" : "none"}
        strokeWidth={2.5}
      />
    </span>
  );
}

export function DotVoteSticker({
  kind,
  count,
  state,
  onRemove,
  onDragStart,
}: DotVoteStickerProps) {
  const label = stickerLabel(kind, count);
  const isPreview = state === "preview";
  const pointerOriginRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const shouldShowCount = state === "result" || count > 1;
  const displayedCount =
    state === "result" ? `×${displayCount(count)}` : displayCount(count);
  const content = (
    <span aria-hidden="true" className="relative inline-flex">
      <DotVoteStickerImage kind={kind} />
      {shouldShowCount ? (
        <span
          className={`absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border bg-white px-0.5 text-[0.55rem] leading-none font-bold shadow-sm ${DOT_VOTE_COUNT_TONE[kind]}`}
        >
          {displayedCount}
        </span>
      ) : null}
    </span>
  );

  if (onRemove) {
    return (
      <button
        type="button"
        data-state={state}
        aria-label={`${label}を1票取り消す`}
        className={`inline-flex transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${DOT_VOTE_SHAPE[kind]} ${
          onDragStart ? "touch-none cursor-grab" : ""
        } ${state === "pending" ? "animate-pulse" : ""}`}
        onPointerDown={(event) => {
          pointerOriginRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          didDragRef.current = false;
          onDragStart?.(event);
        }}
        onPointerMove={(event) => {
          const origin = pointerOriginRef.current;
          if (
            onDragStart &&
            origin?.pointerId === event.pointerId &&
            Math.hypot(
              event.clientX - origin.clientX,
              event.clientY - origin.clientY,
            ) >= DRAG_THRESHOLD_PX
          ) {
            didDragRef.current = true;
          }
        }}
        onClick={(event) => {
          if (didDragRef.current) {
            event.preventDefault();
            event.stopPropagation();
            pointerOriginRef.current = null;
            didDragRef.current = false;
            return;
          }
          pointerOriginRef.current = null;
          onRemove();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      role="img"
      data-state={state}
      aria-label={
        isPreview ? `${DOT_VOTE_LABELS[kind]}シールを貼る位置` : label
      }
      className={`inline-flex ${DOT_VOTE_SHAPE[kind]} ${
        isPreview ? "pointer-events-none opacity-50" : ""
      } ${state === "pending" ? "animate-pulse" : ""}`}
    >
      {content}
    </span>
  );
}
