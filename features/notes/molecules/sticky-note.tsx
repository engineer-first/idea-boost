import type * as React from "react";
import { NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import type { NoteColor } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { cn } from "@/lib/utils";
import { getNoteShadow } from "../logic/note-shadow";

export type StickyNoteProps = {
  noteId: string;
  isLifted?: boolean;
  isSelected?: boolean;
  isDecided?: boolean;
  color?: NoteColor;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  "data-editing"?: boolean;
  "data-vote-drop-target"?: boolean;
  "data-excluded"?: boolean;
};

// RoomBoard の molecule。共有ボードとマイ付箋で共通利用する付箋の見た目だけを担う。
export function StickyNote({
  noteId,
  isLifted = false,
  isSelected = false,
  isDecided = false,
  color = "yellow",
  children,
  className,
  style,
  testId,
  "data-editing": dataEditing,
  "data-vote-drop-target": dataVoteDropTarget,
  "data-excluded": dataExcluded,
}: StickyNoteProps) {
  return (
    <div
      data-slot="sticky-note"
      data-testid={testId}
      data-note-id={noteId}
      data-selected={isSelected || undefined}
      data-decided={isDecided || undefined}
      data-editing={dataEditing || undefined}
      data-vote-drop-target={dataVoteDropTarget || undefined}
      data-excluded={dataExcluded || undefined}
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-[2px]",
        isSelected
          ? "outline-2 outline-blue-500 dark:outline-blue-400"
          : "outline-none",
        isDecided
          ? "outline-4 outline-solid outline-emerald-600 outline-offset-2"
          : "",
        className,
      )}
      style={{
        width: NOTE_WIDTH,
        height: NOTE_HEIGHT,
        boxShadow: dataExcluded ? "none" : getNoteShadow(noteId, { isLifted }),
        border: dataExcluded ? "1px dashed rgb(100 116 139 / 0.55)" : undefined,
        ...style,
        backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
      }}
    >
      {children}
    </div>
  );
}
