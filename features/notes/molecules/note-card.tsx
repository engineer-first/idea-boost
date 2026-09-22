"use client";

import { Check, CircleMinus, RotateCcw } from "lucide-react";
// 付箋1枚の表示用コンポーネント。データ層には一切依存せず、位置(x, y)や
// 本文はすべてpropsで受け取り、変化はコールバックpropsで親へ通知するだけの
// コンポーネントにする。状態の保持・永続化・リアルタイム配信は呼び出し側の責務。
//
// インタラクションは tldraw の Note shape（SelectTool/PointingShape）を踏襲:
//   - pointerdown で選択し、閾値(DRAG_THRESHOLD_PX)を超えて動かすとドラッグ
//   - 「pointerdown 時点で選択済みだった」付箋への移動なしクリック、または
//     選択中の印字可能キーで編集開始
//   - 選択中（非編集）は Backspace / Delete で削除、Enter でも編集開始
// 選択状態(isSelected)は「同時に1枚だけ」という付箋間の関心事なので親が持ち、
// 編集状態(isEditing)はこの付箋に閉じた関心事なのでローカルに持つ。
import { useEffect, useRef, useState } from "react";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { DotVoteKind } from "@/contracts/room-protocol";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import {
  type DotVoteRemaining,
  DotVoteSticker,
  type VoteDisplayMode,
} from "@/features/dot-vote";
import type { Note } from "../logic/notes-reducer";
import { StickyNote } from "./sticky-note";

export type NoteCardProps = {
  note: Note;
  // 自分自身が現在ドラッグ中かどうか。trueの間は影を深くして「持ち上げた」見た目にする。
  isOwnDrag: boolean;
  isSelected: boolean;
  editingDisabled?: boolean;
  isDecided?: boolean;
  isAdoptionFocused?: boolean;
  // WebSocket未接続時（connecting/closed）に親から渡す。true の間は選択・
  // ドラッグ・編集開始・削除を無効化する。room-client.send() は未openだと
  // メッセージを黙って破棄するため、UI操作自体を止めないと「入力したのに
  // サーバーへ届かず再接続後の snapshot で消える」体験になってしまう。
  disabled?: boolean;
  canEditNote: boolean;
  canDeleteNote: boolean;
  canMoveNote: boolean;
  canExcludeNote?: boolean;
  canRestoreNote?: boolean;
  onSelect: (noteId: string) => void;
  onDragStart: (
    noteId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onContentChange: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onExclude?: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
  vote: {
    displayMode: VoteDisplayMode;
    selectedKind: DotVoteKind | null;
    voteRemaining: DotVoteRemaining;
    canVote: boolean;
    pendingOperations: ReadonlyArray<{
      noteId: string;
      kind: DotVoteKind;
      stickerId?: string;
    }>;
    onVote: (noteId: string, kind: DotVoteKind) => void;
    onVoteRemove: (noteId: string, kind: DotVoteKind) => void;
    onStickerRemove?: (stickerId: string) => void;
    onStickerDragStart?: (
      stickerId: string,
      kind: DotVoteKind,
      event: React.PointerEvent<HTMLButtonElement>,
    ) => void;
  };
  className?: string;
  style?: React.CSSProperties;
  autoFocusEditor?: boolean;
  onAutoFocusEditorComplete?: () => void;
};

type PointerOrigin = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  // pointerdown 時点で選択済みだったか。これが true の「移動なしクリック」を
  // 編集開始の合図にする。
  wasSelected: boolean;
  didDrag: boolean;
};

function isPrintableCharacterKey(
  event: React.KeyboardEvent<HTMLButtonElement>,
): boolean {
  return (
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

export function NoteCard({
  note,
  isOwnDrag,
  isSelected,
  editingDisabled = false,
  isDecided = false,
  isAdoptionFocused = false,
  disabled = false,
  canEditNote,
  canDeleteNote,
  canMoveNote,
  canExcludeNote = false,
  canRestoreNote = false,
  onSelect,
  onDragStart,
  onContentChange,
  onDelete,
  onExclude,
  onRestore,
  vote,
  className,
  style,
  autoFocusEditor = false,
  onAutoFocusEditorComplete,
}: NoteCardProps) {
  const [localContent, setLocalContent] = useState(note.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isTouchActionVisible, setIsTouchActionVisible] = useState(false);
  const [isPointerActionVisible, setIsPointerActionVisible] = useState(false);
  const [isFocusActionVisible, setIsFocusActionVisible] = useState(false);
  const pointerOriginRef = useRef<PointerOrigin | null>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canCandidateAction = note.excluded ? canRestoreNote : canExcludeNote;
  const candidateActionLabel = note.excluded ? "候補に戻す" : "候補から外す";
  const isCandidateActionVisible =
    isTouchActionVisible || isPointerActionVisible || isFocusActionVisible;

  // 他ユーザーの編集がWebSocket（RoomDO）経由で届いたら反映する。
  // ただし自分が編集モードの間は上書きしない
  // （タイピング中に他人の更新で巻き戻るのを防ぐ）。
  useEffect(() => {
    if (!isEditing) {
      setLocalContent(note.content);
    }
  }, [note.content, isEditing]);

  // 選択が外れたら編集モードも終了する（選択は編集の前提状態）。
  useEffect(() => {
    if (!isSelected) {
      setIsEditing(false);
    }
  }, [isSelected]);

  // 編集中に切断されたら、未送信の下書きを送らずに編集を強制終了する。
  // onContentChange は呼ばない（onBlur側のガードにも依存しない二重の安全策）。
  useEffect(() => {
    if (disabled && isEditing) {
      setIsEditing(false);
      setLocalContent(note.content);
    }
  }, [disabled, isEditing, note.content]);

  // 結果ステップへ切り替わりeditingDisabledになったら、編集中でも
  // 未送信の下書きを送らずに編集を強制終了する（disabledと同じ二重の安全策）。
  useEffect(() => {
    if (editingDisabled && isEditing) {
      setIsEditing(false);
      setLocalContent(note.content);
    }
  }, [editingDisabled, isEditing, note.content]);

  useEffect(() => {
    if (!canEditNote && isEditing) {
      setIsEditing(false);
      setLocalContent(note.content);
    }
  }, [canEditNote, isEditing, note.content]);

  useEffect(() => {
    if (isActionMenuOpen) menuItemRef.current?.focus();
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (
      autoFocusEditor &&
      isSelected &&
      canEditNote &&
      !editingDisabled &&
      !disabled
    ) {
      setIsEditing(true);
      onAutoFocusEditorComplete?.();
    }
  }, [
    autoFocusEditor,
    canEditNote,
    disabled,
    editingDisabled,
    isSelected,
    onAutoFocusEditorComplete,
  ]);

  const pendingVoteStickerIds = new Set(
    vote.pendingOperations
      .filter(({ stickerId }) => stickerId !== undefined)
      .map(({ stickerId }) => stickerId)
      .filter((stickerId): stickerId is string => stickerId !== undefined),
  );
  const pendingVoteKinds = vote.pendingOperations
    .filter(
      ({ noteId, stickerId }) => noteId === note.id && stickerId === undefined,
    )
    .map(({ kind }) => kind);
  const selectedStampKind =
    vote.displayMode === "voting" &&
    vote.canVote &&
    vote.selectedKind !== null &&
    vote.voteRemaining[vote.selectedKind] > 0
      ? vote.selectedKind
      : null;

  // 状態に応じてフォーカスを移す。サーフェスにフォーカスがないと
  // Backspace削除などのキー操作を受け取れない。
  useEffect(() => {
    if (isEditing) {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        const caret = textarea.value.length;
        textarea.setSelectionRange(caret, caret);
      }
    } else if (isSelected) {
      surfaceRef.current?.focus();
    }
  }, [isEditing, isSelected]);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (selectedStampKind !== null) {
      event.preventDefault();
      pointerOriginRef.current = null;
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerOriginRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      wasSelected: isSelected,
      didDrag: false,
    };
    if (!isSelected) {
      onSelect(note.id);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = pointerOriginRef.current;
    if (!origin) {
      return;
    }
    if (!origin.didDrag) {
      const distance = Math.hypot(
        event.clientX - origin.startClientX,
        event.clientY - origin.startClientY,
      );
      if (distance < DRAG_THRESHOLD_PX) {
        return;
      }
      if (!canMoveNote) {
        return;
      }
      origin.didDrag = true;
      // キャプチャをリリースし、ドラッグ処理を親に移管する
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      onDragStart(note.id, event);
      pointerOriginRef.current = null;
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = pointerOriginRef.current;
    pointerOriginRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // 内容を読みやすくするタップ状態は権限と分離する。復帰操作を使えない
    // 参加者にも、候補外付箋の本文を確認する権利がある。
    if (event.pointerType === "touch" && note.excluded) {
      setIsTouchActionVisible(true);
    }
    if (!origin) {
      return;
    }
    if (origin.wasSelected && canEditNote && !editingDisabled) {
      setIsEditing(true);
    }
  }

  function performCandidateAction() {
    setIsActionMenuOpen(false);
    setIsTouchActionVisible(false);
    if (disabled) return;
    if (note.excluded) {
      if (canRestoreNote) onRestore?.(note.id);
      return;
    }
    if (canExcludeNote) onExclude?.(note.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      if (canCandidateAction) setIsActionMenuOpen(true);
      return;
    }

    if (
      selectedStampKind !== null &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      event.stopPropagation();
      vote.onVote(note.id, selectedStampKind);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();

      if (canDeleteNote) {
        onDelete(note.id);
      }

      return;
    }

    if (event.key === "Enter" && canEditNote && !editingDisabled) {
      event.preventDefault();
      setIsEditing(true);
      return;
    }

    if (
      isSelected &&
      canEditNote &&
      !editingDisabled &&
      isPrintableCharacterKey(event)
    ) {
      const character = event.key;
      event.preventDefault();
      event.stopPropagation();
      setLocalContent((content) =>
        content.length < NOTE_CONTENT_MAX_LENGTH
          ? `${content}${character}`
          : content,
      );
      setIsEditing(true);
    }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    if (disabled || !canCandidateAction) return;
    event.preventDefault();
    setIsActionMenuOpen(true);
  }

  return (
    <StickyNote
      noteId={note.id}
      isLifted={isOwnDrag}
      isSelected={isSelected}
      isDecided={isDecided}
      isAdoptionFocused={isAdoptionFocused}
      color={note.color}
      testId="note-card"
      data-editing={isEditing || undefined}
      data-vote-drop-target={
        vote.displayMode === "voting" && vote.canVote ? true : undefined
      }
      data-excluded={note.excluded || undefined}
      className={`${className ?? "absolute"} group ${note.excluded ? "z-0" : "z-10"} ${
        note.excluded
          ? `${isTouchActionVisible ? "opacity-90" : "opacity-45"} grayscale transition-opacity hover:opacity-90 focus-within:opacity-90`
          : ""
      }`}
      style={
        style ?? {
          left: note.x,
          top: note.y,
        }
      }
    >
      {note.excluded ? (
        <>
          <span className="pointer-events-none absolute top-2 left-2 z-30 rounded-full bg-slate-950/80 px-2 py-1 text-xs font-bold text-white">
            候補外
          </span>
          {canRestoreNote ? (
            <button
              type="button"
              aria-label="候補に戻す"
              title="候補に戻す"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                performCandidateAction();
              }}
              className={`absolute right-1 bottom-1 z-40 flex size-11 items-center justify-center rounded-full bg-slate-950 text-white shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${
                isCandidateActionVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="sr-only">候補に戻す</span>
            </button>
          ) : null}
        </>
      ) : null}
      {!note.excluded && canExcludeNote ? (
        <button
          type="button"
          aria-label="候補から外す"
          title="候補から外す"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            performCandidateAction();
          }}
          className={`absolute right-1 bottom-1 z-40 flex size-11 items-center justify-center rounded-full border border-slate-950/15 bg-white/90 text-slate-950 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${
            isCandidateActionVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <CircleMinus aria-hidden="true" className="size-4" />
          <span className="sr-only">候補から外す</span>
        </button>
      ) : null}
      <textarea
        ref={textareaRef}
        value={localContent}
        readOnly={!isEditing || note.excluded}
        // サーバー（RoomDO）は上限超過を invalid-message で拒否するため、
        // UI 側でも同じコントラクト定数で「そもそも入力できない」形に塞ぐ。
        maxLength={NOTE_CONTENT_MAX_LENGTH}
        tabIndex={isEditing ? 0 : -1}
        onChange={(event) => setLocalContent(event.target.value)}
        onBlur={(event) => {
          setIsEditing(false);
          if (disabled || editingDisabled || !canEditNote || note.excluded) {
            return;
          }
          onContentChange(note.id, event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            // Escape はキャンセルではなく「編集の完了」（tldraw 踏襲）。
            // 編集終了でフォーカスがサーフェスへ移り、上の onBlur が発火して
            // 内容が確定する。誤操作で入力を失わせないための意図的な挙動。
            setIsEditing(false);
          }
        }}
        className={`min-h-0 flex-1 resize-none bg-transparent px-2 pt-2 pr-10 pb-2 text-sm text-slate-900 outline-none ${
          note.excluded ? "pt-12" : ""
        } ${isEditing ? "" : "pointer-events-none select-none"}`}
        placeholder="メモを入力..."
      />
      {isDecided ? (
        <span
          role="status"
          aria-label="取り組む課題に決定済み"
          className="pointer-events-none absolute bottom-1 right-1 z-30 flex size-9 items-center justify-center rounded-full border-2 border-white bg-emerald-700 text-white shadow-lg"
        >
          <Check aria-hidden="true" className="size-5" strokeWidth={3} />
        </span>
      ) : null}
      {vote.displayMode === "result" ? (
        <div
          data-testid="note-vote-results"
          className={`pointer-events-none relative z-20 flex h-10 shrink-0 items-end gap-2 pb-2 pl-2 ${
            isDecided || canCandidateAction ? "pr-12" : "pr-2"
          }`}
        >
          <DotVoteSticker
            kind="subjective"
            count={note.dotVotes.subjective.count ?? 0}
            state="result"
          />
          <DotVoteSticker
            kind="objective"
            count={note.dotVotes.objective.count ?? 0}
            state="result"
          />
        </div>
      ) : null}
      {vote.displayMode === "voting" ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          {(note.dotVoteStickers.length > 0
            ? note.dotVoteStickers.map((sticker) => ({
                ...sticker,
                count: 1,
              }))
            : (["subjective", "objective"] as const)
                .filter((kind) => note.dotVotes[kind].ownCount > 0)
                .map((kind) => ({
                  id: `legacy-${kind}`,
                  kind,
                  x: kind === "subjective" ? 0.82 : 0.72,
                  y: 0.16,
                  count: note.dotVotes[kind].ownCount,
                }))
          ).map((sticker) => (
            <div
              key={sticker.id}
              data-vote-sticker-id={sticker.id}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${sticker.x * 100}%`,
                top: `${sticker.y * 100}%`,
              }}
            >
              <DotVoteSticker
                kind={sticker.kind}
                count={sticker.count}
                state={
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind)
                    ? "pending"
                    : "confirmed"
                }
                onRemove={
                  disabled ||
                  !vote.canVote ||
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind)
                    ? undefined
                    : sticker.id.startsWith("legacy-") ||
                        vote.onStickerRemove === undefined
                      ? () => vote.onVoteRemove(note.id, sticker.kind)
                      : () => vote.onStickerRemove?.(sticker.id)
                }
                onDragStart={
                  disabled ||
                  !vote.canVote ||
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind) ||
                  sticker.id.startsWith("legacy-")
                    ? undefined
                    : vote.onStickerDragStart === undefined
                      ? undefined
                      : (event) =>
                          vote.onStickerDragStart?.(
                            sticker.id,
                            sticker.kind,
                            event,
                          )
                }
              />
            </div>
          ))}
        </div>
      ) : null}
      {!isEditing && (
        // 選択・ドラッグ・キー操作を受ける透明なサーフェス。
        // button要素は対話的な子要素(textarea)を持てないため、カード全体を
        // buttonにせず、非編集時だけ本文の上に実buttonを重ねる。
        // 編集中はアンマウントされるので、ポインター操作もBackspaceも
        // 自然にtextarea側へ渡る。
        <button
          ref={surfaceRef}
          type="button"
          aria-label={
            selectedStampKind === null
              ? note.excluded
                ? "候補外の付箋"
                : "付箋"
              : `付箋（${selectedStampKind === "subjective" ? "主観" : "客観"}シールを貼る）`
          }
          aria-disabled={disabled || undefined}
          aria-haspopup={canCandidateAction ? "menu" : undefined}
          aria-expanded={canCandidateAction ? isActionMenuOpen : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerEnter={() => setIsPointerActionVisible(true)}
          onPointerLeave={() => setIsPointerActionVisible(false)}
          onFocus={() => setIsFocusActionVisible(true)}
          onBlur={() => setIsFocusActionVisible(false)}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          className={`absolute inset-0 z-10 touch-none select-none outline-none ${
            disabled
              ? "cursor-not-allowed"
              : selectedStampKind !== null
                ? "cursor-none"
                : isOwnDrag
                  ? "cursor-grabbing"
                  : "cursor-grab"
          }`}
        />
      )}
      {isActionMenuOpen && canCandidateAction ? (
        <div
          role="menu"
          aria-label="付箋の候補操作"
          className="absolute right-2 bottom-2 z-50 min-w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setIsActionMenuOpen(false);
            surfaceRef.current?.focus();
          }}
        >
          <button
            ref={menuItemRef}
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              performCandidateAction();
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-950 outline-none hover:bg-slate-100 focus:bg-slate-100"
          >
            {note.excluded ? (
              <RotateCcw aria-hidden="true" className="size-4" />
            ) : (
              <CircleMinus aria-hidden="true" className="size-4" />
            )}
            {candidateActionLabel}
          </button>
        </div>
      ) : null}
    </StickyNote>
  );
}
