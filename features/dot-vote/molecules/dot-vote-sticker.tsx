import { Star, Users } from "lucide-react";
import type { ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { DotVoteKind } from "@/contracts/room-protocol";
import { dotVoteStickerName, dotVoteStickerTooltip } from "../logic/dot-vote";

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

// 2種類とも薄い面に種類の色の枠と線のアイコンで描き、形（丸と角丸四角）と色で見分ける。
const DOT_VOTE_ICON = {
  subjective: Star,
  objective: Users,
} satisfies Record<DotVoteKind, typeof Star>;

const DOT_VOTE_TONE = {
  subjective:
    "rounded-full border-vote-subjective bg-vote-subjective-soft text-vote-subjective",
  objective:
    "rounded-md border-vote-objective bg-vote-objective-soft text-vote-objective",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_COUNT_TONE = {
  subjective: "border-vote-subjective/35 text-vote-subjective-text",
  objective: "border-vote-objective/35 text-vote-objective-text",
} satisfies Record<DotVoteKind, string>;

const DOT_VOTE_SHAPE = {
  subjective: "rounded-full",
  objective: "rounded-md",
} satisfies Record<DotVoteKind, string>;

type DotVoteStickerImageSize = "default" | "result" | "palette";

const DOT_VOTE_IMAGE_SIZE = {
  default: "size-7",
  result: "size-[22px]",
  palette: "size-13",
} satisfies Record<DotVoteStickerImageSize, string>;

const DOT_VOTE_ICON_SIZE = {
  default: "size-4",
  result: "size-3.5",
  palette: "size-8",
} satisfies Record<DotVoteStickerImageSize, string>;

function stickerLabel(kind: DotVoteKind, count: number): string {
  return `${dotVoteStickerName(kind)} ${count}票`;
}

function displayCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function DotVoteStickerImage({
  kind,
  size = "default",
}: {
  kind: DotVoteKind;
  size?: DotVoteStickerImageSize;
}) {
  const Icon = DOT_VOTE_ICON[kind];
  return (
    <span
      aria-hidden="true"
      data-testid={`dot-vote-sticker-image-${kind}`}
      className={`flex shrink-0 items-center justify-center border-2 ${
        DOT_VOTE_IMAGE_SIZE[size]
      } ${DOT_VOTE_TONE[kind]}`}
    >
      <Icon
        data-testid={`dot-vote-sticker-icon-${kind}`}
        className={DOT_VOTE_ICON_SIZE[size]}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </span>
  );
}

// 付箋の上のシールはアイコンだけなので、合わせたときに名前と種類を1行で示す。
function WithStickerTooltip({
  kind,
  children,
}: {
  kind: DotVoteKind;
  children: ReactElement;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{dotVoteStickerTooltip(kind)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const shouldShowCount = count > 1;
  const displayedCount = displayCount(count);

  if (state === "result" && count === 0) {
    return null;
  }

  if (state === "result") {
    return (
      <span
        role="img"
        data-state={state}
        aria-label={label}
        className="inline-flex min-w-[55px] items-center"
        style={{ flexBasis: 55, flexGrow: Math.max(count, 1) }}
      >
        <span
          aria-hidden="true"
          data-testid={`dot-vote-result-stack-${kind}`}
          className="relative h-[22px] min-w-[22px] flex-1"
          style={{ maxWidth: 22 + Math.max(count - 1, 0) * 12 }}
        >
          {Array.from({ length: count }, (_, voteIndex) => voteIndex + 1).map(
            (voteNumber) => (
              <span
                // 同じ集計から常に同じ並びになる。票が増えると、
                // 22px の大きさは保ったまま左端間隔だけを狭める。
                key={`${kind}-vote-${voteNumber}`}
                className="absolute top-0"
                style={{
                  left:
                    count <= 1
                      ? 0
                      : `calc((100% - 22px) * ${voteNumber - 1} / ${count - 1})`,
                  zIndex: voteNumber,
                }}
              >
                <DotVoteStickerImage kind={kind} size="result" />
              </span>
            ),
          )}
        </span>
        <span
          aria-hidden="true"
          data-testid={`dot-vote-result-count-${kind}`}
          className="ml-[15px] min-w-[2ch] shrink-0 text-left text-sm leading-[22px] font-bold text-foreground tabular-nums"
        >
          {count}
        </span>
      </span>
    );
  }

  const content = (
    <span aria-hidden="true" className="relative inline-flex">
      <DotVoteStickerImage kind={kind} />
      {shouldShowCount ? (
        <span
          className={`absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border bg-white px-0.5 text-xs leading-none font-bold ${DOT_VOTE_COUNT_TONE[kind]}`}
        >
          {displayedCount}
        </span>
      ) : null}
    </span>
  );

  if (onRemove) {
    return (
      <WithStickerTooltip kind={kind}>
        <button
          type="button"
          data-state={state}
          aria-label={`${label}を1票取り消す`}
          className={`inline-flex transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${DOT_VOTE_SHAPE[kind]} ${
            onDragStart ? "touch-none cursor-grab active:cursor-grabbing" : ""
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
          onPointerCancel={() => {
            pointerOriginRef.current = null;
            didDragRef.current = false;
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
      </WithStickerTooltip>
    );
  }

  const sticker = (
    <span
      role="img"
      data-state={state}
      aria-label={isPreview ? `${dotVoteStickerName(kind)}を貼る位置` : label}
      className={`inline-flex ${DOT_VOTE_SHAPE[kind]} ${
        isPreview ? "pointer-events-none opacity-50" : ""
      } ${state === "pending" ? "animate-pulse" : ""}`}
    >
      {content}
    </span>
  );

  // ドラッグ中のプレビューは操作対象ではないため、説明を出さない。
  return isPreview ? (
    sticker
  ) : (
    <WithStickerTooltip kind={kind}>{sticker}</WithStickerTooltip>
  );
}
