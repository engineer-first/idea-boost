import type * as React from "react";
import { NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import type { NoteColor } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { cn } from "@/lib/utils";
import { getNoteShadow } from "../logic/note-shadow";

export type StickyNoteProps = {
  ref?: React.Ref<HTMLDivElement>;
  noteId: string;
  isLifted?: boolean;
  isSelected?: boolean;
  isDecided?: boolean;
  isAdoptionFocused?: boolean;
  color?: NoteColor;
  children: React.ReactNode;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  "data-editing"?: boolean;
  "data-vote-drop-target"?: boolean;
  "data-excluded"?: boolean;
};

// RoomBoard の molecule。共有ボードとマイ付箋で共通利用する付箋の見た目だけを担う。
export function StickyNote({
  ref,
  noteId,
  isLifted = false,
  isSelected = false,
  isDecided = false,
  isAdoptionFocused = false,
  color = "yellow",
  children,
  height = NOTE_HEIGHT,
  className,
  style,
  testId,
  "data-editing": dataEditing,
  "data-vote-drop-target": dataVoteDropTarget,
  "data-excluded": dataExcluded,
}: StickyNoteProps) {
  return (
    <div
      ref={ref}
      data-slot="sticky-note"
      data-testid={testId}
      data-note-id={noteId}
      data-selected={isSelected || undefined}
      data-decided={isDecided || undefined}
      data-adoption-focused={isAdoptionFocused || undefined}
      data-editing={dataEditing || undefined}
      data-vote-drop-target={dataVoteDropTarget || undefined}
      data-excluded={dataExcluded || undefined}
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-[2px]",
        isDecided
          ? "outline-4 outline-solid outline-emerald-600 outline-offset-2"
          : isAdoptionFocused
            ? "outline-2 outline-dashed outline-emerald-500 outline-offset-2"
            : isSelected
              ? "outline-2 outline-blue-500"
              : "outline-none",
        className,
      )}
      style={{
        width: NOTE_WIDTH,
        height,
        boxShadow: dataExcluded ? "none" : getNoteShadow(noteId, { isLifted }),
        border: dataExcluded ? "1px dashed rgb(71 85 105 / 0.75)" : undefined,
        backgroundImage:
          isAdoptionFocused && !isDecided
            ? "linear-gradient(rgb(16 185 129 / 0.12), rgb(16 185 129 / 0.12))"
            : undefined,
        ...style,
        backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
        color: NOTE_COLOR_STYLES[color].foregroundColor,
      }}
    >
      {children}
    </div>
  );
}
