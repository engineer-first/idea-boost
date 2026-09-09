import { MousePointer2 } from "lucide-react";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { cn } from "@/lib/utils";
import type { RemoteCursorPresence } from "../logic/cursor-presence";

export type RemoteCursorProps = {
  cursor: RemoteCursorPresence;
  isIdle: boolean;
  // 同位置でラベルが完全に重ならないよう、呼び出し側の安定した順序でずらす。
  labelOffset?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function RemoteCursor({
  cursor,
  isIdle,
  labelOffset = 0,
  className,
  style,
}: RemoteCursorProps) {
  const color = NOTE_COLOR_STYLES[cursor.color].backgroundColor;
  return (
    <div
      aria-hidden="true"
      data-testid={`remote-cursor-${cursor.userId}`}
      data-dragging-note-id={cursor.draggingNoteId ?? undefined}
      className={cn(
        "pointer-events-none absolute z-50 size-0 transition-[transform,left,bottom,opacity] duration-100 ease-out motion-reduce:transition-none",
        isIdle && "opacity-40",
        className,
      )}
      style={{
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
        ...style,
      }}
    >
      <MousePointer2
        className="absolute top-0 left-0 size-5 -translate-x-0.5 -translate-y-0.5 text-slate-950 drop-shadow-sm"
        style={{ fill: color }}
      />
      <div
        className="absolute top-5 left-3 flex w-max max-w-44 items-center gap-1 rounded-md border border-white/80 bg-slate-950/90 px-2 py-1 text-xs font-medium text-white shadow-md"
        style={{ transform: `translateY(${labelOffset * 20}px)` }}
      >
        <span
          className="size-2 shrink-0 rounded-full border border-white/80"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{cursor.name || "名前未設定"}</span>
        {cursor.draggingNoteId ? (
          <span className="shrink-0 text-[10px] text-slate-300">
            付箋を移動中
          </span>
        ) : null}
      </div>
    </div>
  );
}
