import "./sticky-note.css";
import { Check } from "lucide-react";
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
  /** 渡すと、盤面の決定はんこが「確定を取り消す」ボタンになる（参照表示では無効）。 */
  onStampClick?: () => void;
  stampDisabled?: boolean;
  isAdoptionFocused?: boolean;
  /** 押せば決定できる付箋に、はんこと同じ緑の「決定する」の目印を出す。 */
  showDecideHint?: boolean;
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
  onStampClick,
  stampDisabled = false,
  isAdoptionFocused = false,
  showDecideHint = false,
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
      data-decide-hint={(showDecideHint && !isDecided) || undefined}
      data-editing={dataEditing || undefined}
      data-vote-drop-target={dataVoteDropTarget || undefined}
      data-excluded={dataExcluded || undefined}
      className={cn(
        "sticky-note relative isolate flex flex-col rounded-note",
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
        className="sticky-note-paper pointer-events-none absolute inset-0 -z-10 rounded-note"
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
                    ? [
                        "0 0 0 1px var(--ib-color-surface)",
                        "0 0 0 3px var(--ib-color-state-select)",
                      ]
                    : []),
                  dataExcluded
                    ? "0 0 0 0 transparent"
                    : isDecided
                      ? "0 6px 4px -4px rgba(15,23,42,.35),0 26px 32px -10px rgba(15,23,42,.38)"
                      : getNoteShadow(noteId, { isLifted }),
                ].join(", "),
          // 色に rgb(from …) を使うため、一括指定ではなく幅・線種・色に分けて書く。
          borderWidth: dataExcluded ? 1 : undefined,
          borderStyle: dataExcluded ? "dashed" : undefined,
          borderColor: dataExcluded
            ? "rgb(from var(--ib-color-state-excluded) r g b / 75%)"
            : undefined,
          outline: isDecided
            ? "4px solid var(--ib-color-state-decided)"
            : isAdoptionFocused
              ? "3px dashed var(--ib-color-state-focus)"
              : "4px solid transparent",
          outlineOffset: 4,
        }}
      />
      {/* はんこは中身のクリップ領域から分け、本文・投票シールより前面に描く。 */}
      <div
        data-slot="sticky-note-stamp-layer"
        className="sticky-note-stamp-layer pointer-events-none absolute inset-0 z-30"
      >
        {isDecided && onStampClick && decisionPresentation === "board" ? (
          <button
            type="button"
            title="確定を取り消す"
            aria-label="決定のはんこ（確定を取り消す）"
            disabled={stampDisabled}
            className="sticky-note-stamp sticky-note-stamp-action"
            // 盤面のパン・範囲選択へ押下が渡らないようにする。
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onStampClick}
          >
            決定
          </button>
        ) : (
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
        )}
        {showDecideHint && !isDecided ? (
          // 当たり判定は付箋全体なので、これは押せる場所の目印だけを担う。
          <span className="sticky-note-decide-hint absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border-2 border-state-decided bg-background px-3 py-1.5 text-sm font-bold text-state-decided-text shadow-tool">
            <Check aria-hidden="true" className="size-4" strokeWidth={3} />
            決定する
          </span>
        ) : null}
      </div>
      <div
        data-slot="sticky-note-content"
        className="sticky-note-content relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-note"
      >
        {children}
      </div>
    </div>
  );
}
