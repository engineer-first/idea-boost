import "./sticky-note.css";
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
  /** board: 拡大して右上へ、reference: 拡大せず内側の右下へはんこを表示する。 */
  decisionPresentation?: "board" | "reference";
  isAdoptionFocused?: boolean;
  color?: NoteColor | null;
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
  decisionPresentation = "board",
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
      data-decision-presentation={decisionPresentation}
      data-adoption-focused={isAdoptionFocused || undefined}
      data-editing={dataEditing || undefined}
      data-vote-drop-target={dataVoteDropTarget || undefined}
      data-excluded={dataExcluded || undefined}
      className={cn(
        "sticky-note relative isolate flex flex-col rounded-[2px]",
        className,
      )}
      style={{
        width: NOTE_WIDTH,
        height,
        ...style,
        color:
          color === null
            ? "var(--foreground)"
            : NOTE_COLOR_STYLES[color].foregroundColor,
      }}
    >
      {/* 座標・投票・操作面は外側の固定サイズを使い、紙面と中身を同じ原点で拡大する。 */}
      <div
        data-slot="sticky-note-paper"
        className="sticky-note-paper pointer-events-none absolute inset-0 -z-10 rounded-[2px]"
        style={{
          backgroundColor:
            color === null
              ? "var(--background)"
              : NOTE_COLOR_STYLES[color].backgroundColor,
          boxShadow:
            dataExcluded && !isSelected
              ? "none"
              : [
                  ...(isSelected
                    ? ["0 0 0 1px #fff", "0 0 0 3px #0B93F5"]
                    : []),
                  dataExcluded
                    ? "0 0 0 0 transparent"
                    : isDecided
                      ? "0 6px 4px -4px rgba(15,23,42,.35),0 26px 32px -10px rgba(15,23,42,.38)"
                      : getNoteShadow(noteId, { isLifted }),
                ].join(", "),
          border: dataExcluded ? "1px dashed rgb(71 85 105 / 0.75)" : undefined,
          outline: isDecided
            ? "4px solid #16803F"
            : isAdoptionFocused
              ? "3px dashed #C2410C"
              : "4px solid transparent",
          outlineOffset: isDecided
            ? decisionPresentation === "reference"
              ? -4
              : 5
            : 4,
        }}
      />
      {/* はんこは中身のクリップ領域から分け、本文・投票シールより前面に描く。 */}
      <div
        data-slot="sticky-note-stamp-layer"
        className="sticky-note-stamp-layer pointer-events-none absolute inset-0 z-30"
      >
        <span
          role="status"
          aria-label={
            decisionPresentation === "reference"
              ? "採用済み"
              : "取り組む課題に決定済み"
          }
          aria-hidden={!isDecided || undefined}
          className="sticky-note-stamp"
        >
          決定
        </span>
      </div>
      <div
        data-slot="sticky-note-content"
        className="sticky-note-content relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px]"
      >
        {children}
      </div>
    </div>
  );
}
