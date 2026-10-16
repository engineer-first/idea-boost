"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
// ボード面。カメラで移動・拡大縮小する世界レイヤーに共有付箋・グループ枠・
// ドラッグ中のゴーストを描き、下端にマイ付箋ドックを重ねる。
// ドラッグの状態機械は持たない（logic/use-board-drag が view で束ねる）。
import type {
  CSSProperties,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import {
  DRAG_THRESHOLD_PX,
  getNoteHeight,
  NOTE_HEIGHT,
  NOTE_WIDTH,
} from "@/contracts/board";
import {
  calculateRenderGroups,
  type PersistentGroup,
} from "@/contracts/grouping";
import {
  isAtOrAfterGroupingStep,
  isPhaseStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { DotVoteKind } from "@/contracts/room-protocol";
import type { DotVoteRemaining } from "@/features/dot-vote";
import {
  type Note,
  NoteCard,
  NoteGroupCard,
  PrivateNotesToolbar,
  StickyNote,
} from "@/features/notes";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import type { BoardPermissions } from "../logic/board-permissions";
import { type CanvasCamera, worldToScreen } from "../logic/canvas-camera";
import {
  getCursorLabelOffset,
  type RenderedRemoteCursorPresence,
} from "../logic/cursor-presence";
import {
  FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT,
  getFixedIdeaMapNotePosition,
} from "../logic/idea-value-feasibility-map";
import type { Decision } from "../logic/room-reducer";
import type {
  CanvasMarquee,
  CanvasSelectionOptions,
  CanvasTool,
} from "../logic/use-canvas-selection";
import { getAdoptionTargetLabel } from "../molecules/adopt-note-control";
import { BoardOperationMatrix } from "../molecules/board-operation-matrix";
import { CanvasZoomControls } from "../molecules/canvas-zoom-controls";
import { FixedIdeaMap } from "../molecules/fixed-idea-map";
import type { MoveHistoryControlsProps } from "../molecules/move-history-controls";
import { NoteFontSizeControls } from "../molecules/note-font-size-controls";
import { RemoteCursor } from "../molecules/remote-cursor";

const TEMPORARY_FRONT_Z_INDEX = 2_147_483_647;
const IDEA_MAP_TRAY_NOTE_SCALE = 0.85;
const IDEA_MAP_TRAY_NOTE_WIDTH = Math.round(
  NOTE_WIDTH * IDEA_MAP_TRAY_NOTE_SCALE,
);
const IDEA_MAP_TRAY_NOTE_HEIGHT = Math.round(
  NOTE_HEIGHT * IDEA_MAP_TRAY_NOTE_SCALE,
);
const ADOPTION_TARGET_CLASS_NAME =
  "absolute inset-0 z-20 cursor-pointer rounded-sm border-4 border-transparent bg-transparent outline-none transition-[border-color,background-color,box-shadow] hover:border-emerald-600 hover:bg-emerald-500/10 focus-visible:border-emerald-600 focus-visible:bg-emerald-500/10 focus-visible:ring-4 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2";

export type RoomBoardCanvasProps = {
  rollbackRevision?: number;
  authorName?: (authorId: string) => string | undefined;
  moveHistory?: MoveHistoryControlsProps;
  notes: Note[];
  groups: PersistentGroup[];
  phase: RoomPhase;
  decision: Decision | null;
  isHost: boolean;
  privateNotes: Note[];
  canPublishPrivateNote?: boolean;
  selectedNoteId: string | null;
  selectedNoteIds?: string[];
  interactionTool?: CanvasTool;
  toolDisabled?: boolean;
  marquee?: CanvasMarquee | null;
  onToolChange?: (tool: CanvasTool) => void;
  pendingCandidateNoteIds?: string[];
  draggingNoteId: string | null;
  localDraggingNoteId?: string | null;
  isDisconnected: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  ideaMapIsDragging?: boolean;
  onIdeaMapResize?: (sizeLevel: number) => void;
  voteRemaining: DotVoteRemaining;
  selectedVoteKind: DotVoteKind | null;
  pendingVoteOperations: ReadonlyArray<{
    noteId: string;
    kind: DotVoteKind;
    stickerId?: string;
  }>;
  // ツールバー発ドラッグ中に、まだ notes に現れていない付箋を描くゴースト。
  dragGhost: { note: Note; x: number; y: number } | null;
  dragPreview?: {
    note: Note;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  isReturnDropTarget: boolean;
  isIdeaMapTrayDropTarget?: boolean;
  privateDropPlaceholder?: { noteId: string };
  boardScrollerRef: RefObject<HTMLDivElement | null>;
  ideaMapPlaneRef: RefObject<HTMLDivElement | null>;
  ideaMapTrayRef?: RefObject<HTMLElementTagNameMap["section"] | null>;
  ideaMapTrayFooter?: ReactNode;
  privateToolbarRef: RefObject<HTMLDivElement | null>;
  permissions: BoardPermissions;
  camera: CanvasCamera;
  gridStyle: CSSProperties;
  isPanning: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNotePointerCaptureLost?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToNotes: () => void;
  onSelect: (noteId: string | null, options?: CanvasSelectionOptions) => void;
  onNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    origin?: { clientX: number; clientY: number },
  ) => void;
  onNoteContentChange: (noteId: string, content: string) => void;
  draftValue?: (noteId: string) => string | undefined;
  onDraftChange?: (noteId: string, content: string) => void;
  onDraftCompositionStart?: (noteId: string) => void;
  onDraftCompositionEnd?: (noteId: string, content: string) => void;
  onNoteFontSizeChange?: (noteId: string, fontSize: number) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteExclude?: (noteId: string) => void;
  onNoteRestore?: (noteId: string) => void;
  onNoteVote: (noteId: string, kind: DotVoteKind, x: number, y: number) => void;
  onNoteVoteRemove: (noteId: string, kind: DotVoteKind) => void;
  onNoteVoteStickerRemove: (stickerId: string) => void;
  onNoteVoteStickerDragStart: (
    stickerId: string,
    kind: DotVoteKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  isAdoptMode: boolean;
  adoptionFocusNoteId?: string | null;
  onAdoptionFocusChange?: (noteId: string | null) => void;
  onAdoptNote: (noteId: string) => void;
  onGroupCreate?: (name: string, noteIds: string[]) => void;
  onGroupUpdateName?: (groupId: string, name: string) => void;
  onAddPrivateNote: () => string | null;
  noteCreationPending?: boolean;
  noteCreationReceipt?: { operationId: string; noteId: string };
  noteCreationSupported?: boolean;
  noteCreationFocusContext?: string;
  onPrivateNoteContentChange: (noteId: string, content: string) => void;
  onPrivateNoteDelete: (noteId: string) => void;
  onPrivateNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  remoteCursors: RenderedRemoteCursorPresence[];
  expandPrivateNotesRequest?: number;
  addPrivateNoteRequest?: number;
  privateNoteAddRef?: RefObject<(() => void) | null>;
};

export function RoomBoardCanvas({
  rollbackRevision = 0,
  moveHistory,
  notes,
  groups,
  phase,
  decision,
  isHost,
  privateNotes,
  canPublishPrivateNote = false,
  selectedNoteId,
  selectedNoteIds,
  interactionTool = "select",
  toolDisabled = false,
  marquee = null,
  onToolChange = () => undefined,
  pendingCandidateNoteIds = [],
  draggingNoteId,
  localDraggingNoteId = null,
  isDisconnected,
  ideaMapSizeInitialized = false,
  voteRemaining,
  selectedVoteKind,
  pendingVoteOperations,
  dragGhost,
  dragPreview = null,
  isReturnDropTarget,
  isIdeaMapTrayDropTarget = false,
  privateDropPlaceholder,
  boardScrollerRef,
  ideaMapPlaneRef,
  ideaMapTrayRef,
  ideaMapTrayFooter,
  privateToolbarRef,
  permissions,
  camera,
  gridStyle,
  isPanning,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerEnd,
  onNotePointerCaptureLost,
  onPresencePointerMove,
  onPresencePointerLeave,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToNotes,
  onSelect,
  onNoteDragStart,
  onNoteContentChange,
  draftValue,
  onDraftChange,
  onDraftCompositionStart,
  onDraftCompositionEnd,
  onNoteFontSizeChange = () => undefined,
  onNoteDelete,
  onNoteExclude = () => undefined,
  onNoteRestore = () => undefined,
  onNoteVote,
  onNoteVoteRemove,
  onNoteVoteStickerRemove,
  onNoteVoteStickerDragStart,
  isAdoptMode,
  adoptionFocusNoteId = null,
  onAdoptionFocusChange = () => undefined,
  onAdoptNote,
  onGroupCreate,
  onGroupUpdateName,
  onAddPrivateNote,
  noteCreationPending = false,
  noteCreationReceipt,
  noteCreationSupported = true,
  noteCreationFocusContext,
  onPrivateNoteContentChange,
  onPrivateNoteDelete,
  onPrivateNoteDragStart,
  remoteCursors,
  authorName,
  expandPrivateNotesRequest = 0,
  addPrivateNoteRequest = 0,
  privateNoteAddRef,
}: RoomBoardCanvasProps) {
  const selectionIds =
    selectedNoteIds ?? (selectedNoteId ? [selectedNoteId] : []);
  const isMultiSelected = selectionIds.length > 1;
  const renderGroups = isAtOrAfterGroupingStep(phase)
    ? calculateRenderGroups(notes, groups)
    : [];
  // 候補外を先に描き、付箋単位の wrapper で重なり順を管理する。
  // カードと採用領域を同じ単位に収め、見えている候補とクリック先を一致させる。
  const orderedNotes = [...notes].sort(
    (left, right) => Number(right.excluded) - Number(left.excluded),
  );
  const voteDisplayMode = isVotingStep(phase)
    ? "voting"
    : isResultStep(phase)
      ? "result"
      : "hidden";
  const adoptionTargetLabel = getAdoptionTargetLabel(
    phase.kind === "step" ? phase.phase : 1,
  );
  // 3-3以降は配置マップを使い、配置済みの付箋がある3-1再訪時は閲覧だけできる。
  // 3-2は通常の共有ボード。操作可否は引き続き permissions と RoomDO が権威。
  const isIdeaValueFeasibilityMapVisible =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step >= 3 ||
      (phase.step === 1 && ideaMapSizeInitialized && notes.length > 0));
  const adoptionPointerNoteIdRef = useRef<string | null>(null);
  const adoptionKeyboardNoteIdRef = useRef<string | null>(null);
  const selectedNote = [...notes, ...privateNotes].find(
    (note) => note.id === selectedNoteId,
  );

  useEffect(() => {
    if (isAdoptMode) return;
    // 候補ボタンは確定・キャンセル時にアンマウントされるため、pointerleave / blur
    // が発火するとは限らない。次に選び直した候補へ前回の focus が勝たないよう、
    // 選択モードを抜けた時点で両モダリティの一時状態を破棄する。
    adoptionPointerNoteIdRef.current = null;
    adoptionKeyboardNoteIdRef.current = null;
  }, [isAdoptMode]);

  function publishAdoptionFocus(): void {
    onAdoptionFocusChange(
      adoptionKeyboardNoteIdRef.current ?? adoptionPointerNoteIdRef.current,
    );
  }

  function handleAdoptionPointerEnter(noteId: string): void {
    adoptionPointerNoteIdRef.current = noteId;
    publishAdoptionFocus();
  }

  function handleAdoptionPointerLeave(noteId: string): void {
    if (adoptionPointerNoteIdRef.current === noteId) {
      adoptionPointerNoteIdRef.current = null;
    }
    publishAdoptionFocus();
  }

  function handleAdoptionFocus(noteId: string): void {
    adoptionKeyboardNoteIdRef.current = noteId;
    publishAdoptionFocus();
  }

  function handleAdoptionBlur(noteId: string): void {
    if (adoptionKeyboardNoteIdRef.current === noteId) {
      adoptionKeyboardNoteIdRef.current = null;
    }
    publishAdoptionFocus();
  }

  const adoptionDragRef = useRef<{
    noteId: string;
    pointerId: number;
    x: number;
    y: number;
    didDrag: boolean;
  } | null>(null);
  const suppressAdoptionClickRef = useRef(false);
  function finishAdoptionPointer(
    event: ReactPointerEvent,
    cancelled = false,
  ): void {
    const drag = adoptionDragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    suppressAdoptionClickRef.current = cancelled || drag.didDrag;
    adoptionDragRef.current = null;
  }
  const backgroundPointerRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.button === 0 &&
      (event.target === event.currentTarget ||
        (event.target as HTMLElement).dataset.canvasBackground === "true")
    ) {
      backgroundPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    } else backgroundPointerRef.current = null;
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    handleBoardPointerDown(event);
    onCanvasPointerDown(event);
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const background = backgroundPointerRef.current;
    if (
      background &&
      Math.hypot(event.clientX - background.x, event.clientY - background.y) >=
        DRAG_THRESHOLD_PX
    )
      background.moved = true;
    onCanvasPointerMove(event);
    onPresencePointerMove(event);
  }

  function handleNoteDelete(noteId: string) {
    if (selectedNoteId === noteId) {
      onSelect(null);
    }
    onNoteDelete(noteId);
  }

  function renderNoteCard(
    note: Note,
    maxDisplayHeight?: number,
    displayScale: number | "responsive-map" = 1,
  ) {
    return (
      <NoteCard
        key={`${note.id}:${rollbackRevision}`}
        note={note}
        authorName={authorName?.(note.authorId)}
        maxDisplayHeight={
          maxDisplayHeight ??
          (isIdeaValueFeasibilityMapVisible
            ? FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT
            : undefined)
        }
        isOwnDrag={
          draggingNoteId === note.id || localDraggingNoteId === note.id
        }
        isSelected={selectionIds.includes(note.id)}
        isMultiSelected={isMultiSelected}
        interactionTool={interactionTool}
        editingDisabled={isResultStep(phase)}
        canDeleteNote={
          permissions.canDeleteNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canEditNote={
          permissions.canEditNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canMoveNote={permissions.canMoveNote}
        canExcludeNote={
          isHost &&
          !isAdoptMode &&
          !isMultiSelected &&
          interactionTool === "select" &&
          permissions.canExcludeNote &&
          !note.excluded
        }
        canRestoreNote={
          isHost &&
          !isAdoptMode &&
          !isMultiSelected &&
          interactionTool === "select" &&
          permissions.canRestoreNote &&
          note.excluded
        }
        candidatePending={pendingCandidateNoteIds.includes(note.id)}
        isDecided={decision?.noteId === note.id}
        isAdoptionFocused={
          !isHost &&
          adoptionFocusNoteId === note.id &&
          decision?.noteId !== note.id
        }
        disabled={isDisconnected}
        onSelect={onSelect}
        onDragStart={onNoteDragStart}
        onContentChange={onNoteContentChange}
        draftValue={draftValue?.(note.id)}
        onDraftChange={onDraftChange}
        onDraftCompositionStart={onDraftCompositionStart}
        onDraftCompositionEnd={onDraftCompositionEnd}
        onDelete={handleNoteDelete}
        onExclude={onNoteExclude}
        onRestore={onNoteRestore}
        vote={{
          displayMode: voteDisplayMode,
          selectedKind: selectedVoteKind,
          voteRemaining,
          canVote: permissions.canVote && !note.excluded,
          pendingOperations: pendingVoteOperations,
          // 通常のポインター投票は RoomBoardView がパレットからのドロップ座標を
          // 受けて送る。ここはキーボード互換の既存コールバックだけを残す。
          onVote: (noteId, kind) => onNoteVote(noteId, kind, 0.5, 0.5),
          onVoteRemove: onNoteVoteRemove,
          onStickerRemove: onNoteVoteStickerRemove,
          onStickerDragStart: onNoteVoteStickerDragStart,
        }}
        className="relative pointer-events-auto"
        style={
          displayScale === 1
            ? {}
            : {
                transform:
                  displayScale === "responsive-map"
                    ? "scale(var(--idea-map-note-scale, 1))"
                    : `scale(${displayScale})`,
                transformOrigin:
                  displayScale === "responsive-map"
                    ? "bottom left"
                    : "top left",
              }
        }
      />
    );
  }

  const unplacedMapNotes = isIdeaValueFeasibilityMapVisible
    ? orderedNotes.filter(
        (note) => note.visibility === "shared" && note.ideaMapPlaced === false,
      )
    : [];
  const shouldShowMapTray = isPhaseStep(phase, 3, 3);
  const [isMapTrayOpen, setMapTrayOpen] = useState(false);
  const mapTrayListId = useId();
  const canvasZoomControls = (
    <CanvasZoomControls
      moveHistory={moveHistory}
      showNavigationControls={!isIdeaValueFeasibilityMapVisible}
      interactionTool={interactionTool}
      onToolChange={onToolChange}
      toolDisabled={toolDisabled}
      zoom={camera.zoom}
      onZoomOut={onZoomOut}
      onResetZoom={onResetZoom}
      onZoomIn={onZoomIn}
      onFitToNotes={onFitToNotes}
    />
  );

  function renderPositionedNote(note: Note) {
    const position = isIdeaValueFeasibilityMapVisible
      ? getFixedIdeaMapNotePosition(
          { value: note.y, feasibility: note.x },
          getNoteHeight(note.content, note.fontSize),
        )
      : { left: note.x, top: note.y };
    const isAdoptTarget =
      isAdoptMode &&
      interactionTool === "select" &&
      isHost &&
      !isDisconnected &&
      isResultStep(phase) &&
      note.visibility === "shared" &&
      !note.excluded &&
      decision === null;
    const isRemoteDrag =
      !isDisconnected &&
      remoteCursors.some((cursor) => cursor.draggingNoteId === note.id);
    const isTemporarilyFront = draggingNoteId === note.id || isRemoteDrag;

    return (
      <div
        key={note.id}
        className="isolate pointer-events-auto absolute"
        data-testid={
          isIdeaValueFeasibilityMapVisible
            ? `idea-value-feasibility-map-note-${note.id}`
            : `board-note-${note.id}`
        }
        style={{
          ...position,
          zIndex: isTemporarilyFront
            ? TEMPORARY_FRONT_Z_INDEX
            : note.excluded
              ? 0
              : note.stackOrder,
        }}
      >
        {renderNoteCard(
          note,
          undefined,
          isIdeaValueFeasibilityMapVisible ? "responsive-map" : 1,
        )}
        {isAdoptTarget ? (
          <button
            type="button"
            data-adopt-target="true"
            aria-label={`採用する${adoptionTargetLabel}: ${note.content || "内容なし"}`}
            className={ADOPTION_TARGET_CLASS_NAME}
            onPointerEnter={() => handleAdoptionPointerEnter(note.id)}
            onPointerLeave={() => handleAdoptionPointerLeave(note.id)}
            onFocus={() => handleAdoptionFocus(note.id)}
            onBlur={() => handleAdoptionBlur(note.id)}
            onPointerDown={(event) => {
              if (event.button !== 0 || event.isPrimary === false) return;
              suppressAdoptionClickRef.current = false;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              adoptionDragRef.current = {
                noteId: note.id,
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                didDrag: false,
              };
            }}
            onPointerMove={(event) => {
              const drag = adoptionDragRef.current;
              if ((event.buttons & 1) === 0) {
                adoptionDragRef.current = null;
                return;
              }
              if (
                !drag ||
                drag.pointerId !== event.pointerId ||
                drag.didDrag ||
                Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <
                  DRAG_THRESHOLD_PX
              )
                return;
              drag.didDrag = true;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              onNoteDragStart(note.id, event);
            }}
            onPointerUp={(event) => finishAdoptionPointer(event)}
            onPointerCancel={(event) => finishAdoptionPointer(event, true)}
            onClick={(event) => {
              if (suppressAdoptionClickRef.current && event.detail !== 0)
                return;
              adoptionDragRef.current = null;
              onAdoptNote(note.id);
            }}
          />
        ) : null}
      </div>
    );
  }

  function renderIdeaMapDragGhost() {
    if (!dragGhost) return null;
    const ghostHeight = Math.min(
      FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT,
      getNoteHeight(dragGhost.note.content, dragGhost.note.fontSize),
    );
    const position = getFixedIdeaMapNotePosition(
      {
        value: dragGhost.y,
        feasibility: dragGhost.x,
      },
      ghostHeight,
    );

    return (
      <StickyNote
        noteId={dragGhost.note.id}
        isLifted
        color={dragGhost.note.color}
        height={ghostHeight}
        className="pointer-events-none absolute"
        style={{
          ...position,
          zIndex: TEMPORARY_FRONT_Z_INDEX,
          transform: "scale(var(--idea-map-note-scale, 1))",
          transformOrigin: "bottom left",
        }}
      >
        <p
          className="min-h-0 flex-1 overflow-hidden p-2"
          style={{
            color: NOTE_COLOR_STYLES[dragGhost.note.color].foregroundColor,
            fontSize: `${dragGhost.note.fontSize}px`,
            lineHeight: `${Math.ceil(dragGhost.note.fontSize * 1.5)}px`,
          }}
        >
          {dragGhost.note.content || "メモを入力..."}
        </p>
      </StickyNote>
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <div
        className={`relative flex h-full min-h-0 ${shouldShowMapTray ? "flex-row" : "min-h-80 flex-col"}`}
        data-testid="board-frame"
      >
        <div
          className="pointer-events-none absolute bottom-3 left-3 z-40 flex has-[[data-canvas-help][open]]:z-50 max-w-[calc(100%-1.5rem)] flex-col items-start gap-2"
          data-testid="board-tools-hud"
          data-board-fit-edge="bottom"
        >
          <div className="flex items-center gap-2">
            {permissions.canEditNote ? (
              <NoteFontSizeControls
                fontSize={selectedNote?.fontSize ?? null}
                disabled={
                  isDisconnected ||
                  selectedNote === undefined ||
                  selectedNote.excluded ||
                  (phase.kind === "step" &&
                    phase.step === 1 &&
                    selectedNote.visibility === "shared")
                }
                onChange={(fontSize) => {
                  if (selectedNote)
                    onNoteFontSizeChange(selectedNote.id, fontSize);
                }}
              />
            ) : null}
          </div>
          {!shouldShowMapTray ? (
            <div
              data-testid="canvas-zoom-hud"
              className="flex max-w-full items-center gap-2"
            >
              {canvasZoomControls}
            </div>
          ) : null}
        </div>
        <span aria-live="polite" className="sr-only">
          {selectionIds.length > 0
            ? `選択した付箋：${selectionIds.length}枚`
            : ""}
        </span>
        <div
          ref={boardScrollerRef}
          className={`relative min-h-0 min-w-0 ${isIdeaValueFeasibilityMapVisible ? "flex-1 bg-background" : "h-full bg-muted/20"} overflow-clip [container-type:size] [&_[data-coordinate-range='0-100']]:overflow-visible ${
            isIdeaValueFeasibilityMapVisible
              ? "cursor-default"
              : isAdoptMode
                ? "cursor-crosshair"
                : selectedVoteKind !== null
                  ? "cursor-none"
                  : isPanning
                    ? "cursor-grabbing"
                    : interactionTool === "hand"
                      ? "cursor-grab"
                      : "cursor-default"
          }`}
          data-testid="board-scroller"
          data-interaction-tool={interactionTool}
          tabIndex={-1}
          role="application"
          aria-label="共有キャンバス"
          aria-description={
            isIdeaValueFeasibilityMapVisible
              ? "付箋を2軸マップ内でドラッグして配置します。マップの位置と大きさは固定です。"
              : "背景でVは選択、Hは手のひら。Spaceとドラッグで画面移動"
          }
          data-selection-count={selectionIds.length}
          data-adopt-mode={isAdoptMode || undefined}
          style={
            isIdeaValueFeasibilityMapVisible
              ? { backgroundImage: "none" }
              : gridStyle
          }
          onPointerDownCapture={handleViewportPointerDown}
          onPointerUp={(event) => {
            finishAdoptionPointer(event);
            const background = backgroundPointerRef.current;
            if (
              interactionTool === "select" &&
              selectedNoteIds === undefined &&
              background &&
              !background.moved &&
              (event.target === event.currentTarget ||
                (event.target as HTMLElement).dataset.canvasBackground ===
                  "true")
            )
              onSelect(null);
            backgroundPointerRef.current = null;
            onCanvasPointerEnd(event);
          }}
          onPointerMove={handleViewportPointerMove}
          onPointerCancel={(event) => {
            finishAdoptionPointer(event, true);
            backgroundPointerRef.current = null;
            onCanvasPointerEnd(event);
          }}
          onLostPointerCapture={(event) => {
            onCanvasPointerEnd(event);
            onNotePointerCaptureLost?.(event);
          }}
          onPointerLeave={onPresencePointerLeave}
        >
          <button
            type="button"
            aria-label="共有キャンバスの背景"
            data-canvas-background="true"
            className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700"
          />
          {marquee ? (
            <div
              data-testid="canvas-marquee"
              aria-hidden="true"
              className="pointer-events-none absolute z-30 border border-blue-600 bg-blue-500/10"
              style={marquee}
            />
          ) : null}
          {isIdeaValueFeasibilityMapVisible ? (
            <FixedIdeaMap
              positionAreaRef={ideaMapPlaneRef}
              workspace={shouldShowMapTray}
              overlay={remoteCursors.map((cursor) => (
                <RemoteCursor
                  key={cursor.userId}
                  cursor={cursor}
                  isIdle={cursor.isIdle}
                  labelOffset={getCursorLabelOffset(cursor.userId)}
                  style={{
                    left: `${cursor.x}%`,
                    bottom: `${cursor.y}%`,
                    transform: "none",
                  }}
                />
              ))}
            >
              {orderedNotes
                .filter((note) => note.ideaMapPlaced !== false)
                .map(renderPositionedNote)}
              {renderIdeaMapDragGhost()}
            </FixedIdeaMap>
          ) : null}
          <div
            data-testid="board-canvas"
            data-canvas-background="true"
            className={
              isIdeaValueFeasibilityMapVisible
                ? "absolute top-0 left-0 h-full w-full"
                : "absolute top-0 left-0 min-h-full min-w-full"
            }
            style={{
              transform: isIdeaValueFeasibilityMapVisible
                ? "none"
                : `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
              transformOrigin: "0 0",
              willChange: isIdeaValueFeasibilityMapVisible
                ? "auto"
                : "transform",
            }}
          >
            {!isIdeaValueFeasibilityMapVisible
              ? renderGroups.map((rg) => {
                  const handleUpdateName = (newName: string) => {
                    if (rg.isTemp && rg.representativeNoteId) {
                      const noteIds = rg.id.replace("temp-", "").split(",");
                      onGroupCreate?.(newName, noteIds);
                    } else if (rg.persistentGroupId) {
                      onGroupUpdateName?.(rg.persistentGroupId, newName);
                    }
                  };

                  return (
                    <NoteGroupCard
                      key={rg.id}
                      group={rg}
                      name={rg.name}
                      canGroupNote={permissions.canGroupNote}
                      onUpdateName={handleUpdateName}
                    />
                  );
                })
              : null}

            {!isIdeaValueFeasibilityMapVisible
              ? orderedNotes.map(renderPositionedNote)
              : null}
            {isResultStep(phase) &&
            notes.filter((note) => !note.excluded).length === 0 ? (
              <div
                role="status"
                className="absolute top-6 left-1/2 z-30 -translate-x-1/2 rounded-lg border bg-background/95 px-5 py-3 text-sm font-semibold shadow-md"
              >
                候補がありません。候補外の付箋を戻してください。
              </div>
            ) : null}
            {!isIdeaValueFeasibilityMapVisible && dragGhost ? (
              <StickyNote
                noteId={dragGhost.note.id}
                isLifted
                color={dragGhost.note.color}
                height={getNoteHeight(
                  dragGhost.note.content,
                  dragGhost.note.fontSize,
                )}
                className="pointer-events-none absolute"
                style={{
                  left: dragGhost.x,
                  top: dragGhost.y,
                  zIndex: TEMPORARY_FRONT_Z_INDEX,
                }}
              >
                <p
                  className="min-h-0 flex-1 overflow-hidden p-2"
                  style={{
                    color:
                      NOTE_COLOR_STYLES[dragGhost.note.color].foregroundColor,
                    fontSize: `${dragGhost.note.fontSize}px`,
                    lineHeight: `${Math.ceil(dragGhost.note.fontSize * 1.5)}px`,
                  }}
                >
                  {dragGhost.note.content || "メモを入力..."}
                </p>
              </StickyNote>
            ) : null}
          </div>
          {!isIdeaValueFeasibilityMapVisible
            ? remoteCursors.map((cursor) => (
                <RemoteCursor
                  key={cursor.userId}
                  cursor={{ ...cursor, ...worldToScreen(cursor, camera) }}
                  isIdle={cursor.isIdle}
                  labelOffset={getCursorLabelOffset(cursor.userId)}
                />
              ))
            : null}
        </div>
        {shouldShowMapTray ? (
          <div
            className="relative z-30 flex h-[calc(100%-var(--board-map-tray-top,6.25rem))] min-h-0 w-48 shrink-0 flex-col justify-end gap-2 self-end p-3 md:w-56 max-[639px]:pointer-events-none max-[639px]:absolute max-[639px]:top-[var(--board-map-tray-top,7rem)] max-[639px]:right-0 max-[639px]:bottom-0 max-[639px]:z-[60] max-[639px]:h-auto max-[639px]:w-[min(15rem,calc(100vw-1.5rem))]"
            data-testid="idea-map-tray-space"
          >
            <Card
              className={`pointer-events-auto flex w-full max-h-full min-h-0 flex-col overflow-hidden transition-[box-shadow,background-color] duration-150 ${isMapTrayOpen ? "flex-1" : "h-14 shrink-0"} ${isIdeaMapTrayDropTarget ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
            >
              <section
                aria-label="未配置のアイデア"
                className="flex h-full min-h-0 flex-col"
                data-testid="idea-map-unplaced-tray"
                data-expanded={isMapTrayOpen}
                data-drop-target={isIdeaMapTrayDropTarget || undefined}
                ref={ideaMapTrayRef}
              >
                <CardContent
                  id={mapTrayListId}
                  hidden={!isMapTrayOpen}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
                >
                  <div
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3"
                    data-testid="idea-map-unplaced-scroll"
                  >
                    <p className="mb-3 text-xs text-muted-foreground">
                      {isIdeaMapTrayDropTarget
                        ? "ここにドロップして未配置に戻す"
                        : "共有済みの付箋をマップへドラッグして配置できます。"}
                    </p>
                    <div className="grid grid-cols-1 justify-items-center gap-3">
                      {unplacedMapNotes.map((note) => (
                        <div
                          key={note.id}
                          className="relative shrink-0 self-center"
                          data-testid={`idea-map-tray-note-${note.id}`}
                          style={{
                            height: `${IDEA_MAP_TRAY_NOTE_HEIGHT}px`,
                            width: `${IDEA_MAP_TRAY_NOTE_WIDTH}px`,
                          }}
                        >
                          {localDraggingNoteId === note.id ? (
                            <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground">
                              マップへ移動中
                            </div>
                          ) : (
                            renderNoteCard(
                              note,
                              NOTE_HEIGHT,
                              IDEA_MAP_TRAY_NOTE_SCALE,
                            )
                          )}
                        </div>
                      ))}
                      {unplacedMapNotes.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          配置済みの付箋をここへドラッグすると未配置に戻せます
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
                <CardFooter
                  className={`relative z-20 flex h-14 shrink-0 items-center bg-card p-3 ${isMapTrayOpen ? "border-t border-border" : ""}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <CardTitle className="min-w-0 truncate text-sm">
                      未配置の案
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="icon-sm"
                        disabled
                        aria-label="付箋を追加"
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          isMapTrayOpen
                            ? "未配置の案を閉じる"
                            : "未配置の案を開く"
                        }
                        aria-expanded={isMapTrayOpen}
                        aria-controls={mapTrayListId}
                        onClick={() => setMapTrayOpen((open) => !open)}
                      >
                        {isMapTrayOpen ? (
                          <ChevronDown aria-hidden="true" />
                        ) : (
                          <ChevronUp aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardFooter>
              </section>
            </Card>
            <footer className="pointer-events-auto flex shrink-0 flex-col items-center gap-2">
              {canvasZoomControls}
              {ideaMapTrayFooter}
            </footer>
          </div>
        ) : null}
        {dragPreview && typeof document !== "undefined"
          ? createPortal(
              <StickyNote
                noteId={dragPreview.note.id}
                testId="private-note-drag-preview"
                isLifted
                color={dragPreview.note.color}
                className="pointer-events-none fixed z-[60] opacity-90"
                style={{
                  left: dragPreview.left,
                  top: dragPreview.top,
                  width: dragPreview.width,
                  height: dragPreview.height,
                }}
              >
                <p className="min-h-0 flex-1 overflow-hidden p-2 text-sm text-slate-900">
                  {dragPreview.note.content || "メモを入力..."}
                </p>
              </StickyNote>,
              document.body,
            )
          : null}
        <div
          className={`pointer-events-auto absolute bottom-3 z-40 max-[639px]:bottom-[var(--board-operation-bottom,4.5rem)] ${shouldShowMapTray ? "right-[calc(12rem+0.75rem)] md:right-[calc(14rem+0.75rem)] max-[639px]:hidden" : "right-3"}`}
          data-testid="board-operation-matrix"
          data-board-fit-edge="bottom"
        >
          <BoardOperationMatrix permissions={permissions} />
        </div>
        {permissions.showPrivateToolbar ? (
          <div
            className={`pointer-events-none absolute right-3 bottom-[5.25rem] top-[4.5rem] min-[640px]:group-data-[connection-status=closed]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=connecting]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=auth-required]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=unavailable]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] z-30 flex w-[min(15rem,calc(100vw-1.5rem))] items-end max-[639px]:top-auto max-[639px]:h-[var(--board-private-dock-height,20rem)] ${moveHistory ? "max-[639px]:bottom-[var(--board-private-dock-bottom)] max-[639px]:max-h-[max(0px,calc(100%-var(--board-private-dock-bottom)-16.5rem))]" : isHost && phase.kind === "step" && phase.step === 2 ? "max-[639px]:bottom-[var(--board-private-dock-bottom,11.5rem)] max-[639px]:max-h-[calc(100%-16rem)]" : "max-[639px]:bottom-[var(--board-private-dock-bottom,7.5rem)] max-[639px]:max-h-[calc(100%-12rem)]"}`}
            data-testid="private-notes-dock"
            data-board-fit-edge="bottom"
          >
            <PrivateNotesToolbar
              rollbackRevision={rollbackRevision}
              authorName={authorName}
              notes={privateNotes}
              disabled={isDisconnected}
              canDeleteNote={permissions.canDeleteNote}
              canCreateNote={permissions.canCreateNote && noteCreationSupported}
              noteCreationPending={noteCreationPending}
              noteCreationReceipt={noteCreationReceipt}
              noteCreationFocusContext={noteCreationFocusContext}
              canEditNote={permissions.canEditNote}
              canMoveNote={permissions.canMoveNote}
              sharingHint={
                phase.kind === "step" && phase.step === 2
                  ? canPublishPrivateNote
                    ? "あなたの番です。付箋をボードへドラッグして共有できます。"
                    : "付箋の共有は、自分の番になるまでお待ちください。"
                  : undefined
              }
              editingDisabled={isResultStep(phase)}
              defaultExpanded={
                phase.kind === "step" && phase.step === 1 && phase.phase <= 3
              }
              expandRequest={expandPrivateNotesRequest}
              addRequest={addPrivateNoteRequest}
              addActionRef={privateNoteAddRef}
              className="pointer-events-auto max-h-full"
              toolbarRef={privateToolbarRef}
              isReturnDropTarget={isReturnDropTarget}
              dropPlaceholder={privateDropPlaceholder}
              selectedNoteId={selectedNoteId}
              onSelect={onSelect}
              onAdd={onAddPrivateNote}
              onContentChange={onPrivateNoteContentChange}
              draftValue={draftValue}
              onDraftChange={onDraftChange}
              onDraftCompositionStart={onDraftCompositionStart}
              onDraftCompositionEnd={onDraftCompositionEnd}
              onDelete={onPrivateNoteDelete}
              onDragStart={onPrivateNoteDragStart}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
