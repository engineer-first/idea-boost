"use client";

// ボード面。カメラで移動・拡大縮小する世界レイヤーに共有付箋・グループ枠・
// ドラッグ中のゴーストを描き、下端にマイ付箋ドックを重ねる。
// ドラッグの状態機械は持たない（logic/use-board-drag が view で束ねる）。
import type {
  CSSProperties,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DRAG_THRESHOLD_PX,
  getNoteHeight,
  NOTE_DEFAULT_FONT_SIZE,
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
import {
  type CanvasCamera,
  clampCanvasZoom,
  worldToScreen,
} from "../logic/canvas-camera";
import {
  getCursorLabelOffset,
  type RenderedRemoteCursorPresence,
} from "../logic/cursor-presence";
import {
  getIdeaMapNoteDisplayMetrics,
  getIdeaMapNoteDisplayScale,
  getIdeaMapNoteGeometry,
  getIdeaMapViewportNoteResponsivePositions,
  getIdeaValueFeasibilityMapNotePosition,
  IDEA_MAP_VIEWPORT_NOTE_HEIGHT_LIMIT,
  isIdeaMapViewportStep,
} from "../logic/idea-value-feasibility-map";
import type { Decision } from "../logic/room-reducer";
import type {
  CanvasMarquee,
  CanvasSelectionOptions,
  CanvasTool,
} from "../logic/use-canvas-selection";
import type { SharingReactionControls } from "../logic/use-sharing-reactions";
import { getAdoptionTargetLabel } from "../molecules/adopt-note-control";
import { BoardOperationMatrix } from "../molecules/board-operation-matrix";
import { CanvasZoomControls } from "../molecules/canvas-zoom-controls";
import { IdeaMapSizeControls } from "../molecules/idea-map-size-controls";
import { IdeaMapViewport } from "../molecules/idea-map-viewport";
import { IdeaValueFeasibilityMap } from "../molecules/idea-value-feasibility-map";
import type { MoveHistoryControlsProps } from "../molecules/move-history-controls";
import { NoteFontSizeControls } from "../molecules/note-font-size-controls";
import { RemoteCursor } from "../molecules/remote-cursor";
import styles from "./room-board-canvas.module.css";

const TEMPORARY_FRONT_Z_INDEX = 2_147_483_647;
const ADOPTION_TARGET_CLASS_NAME =
  "absolute inset-0 z-20 cursor-pointer rounded-sm border-4 border-transparent bg-transparent outline-none transition-[border-color,background-color,box-shadow] hover:border-emerald-600 hover:bg-emerald-500/10 focus-visible:border-emerald-600 focus-visible:bg-emerald-500/10 focus-visible:ring-4 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2";

export type RoomBoardCanvasProps = {
  rollbackRevision?: number;
  moveHistory?: MoveHistoryControlsProps;
  reactionControls?: SharingReactionControls;
  notes: Note[];
  groups: PersistentGroup[];
  phase: RoomPhase;
  decision: Decision | null;
  isHost: boolean;
  privateNotes: Note[];
  canPublishPrivateNote?: boolean;
  isSavingBeforeShare?: boolean;
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
  boardInteractionBlocked: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  ideaMapWorkspaceControls?: { phaseLoop: ReactNode; mapSize: ReactNode };
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
    noteDisplayScale?: number;
    unscaledNoteHeight?: number;
  } | null;
  isReturnDropTarget: boolean;
  privateDropPlaceholder?: { noteId: string };
  boardScrollerRef: RefObject<HTMLDivElement | null>;
  ideaMapPlaneRef: RefObject<HTMLDivElement | null>;
  privateToolbarRef: RefObject<HTMLDivElement | null>;
  permissions: BoardPermissions;
  camera: CanvasCamera;
  displayZoom?: number;
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
  reactionControls,
  notes,
  groups,
  phase,
  decision,
  isHost,
  privateNotes,
  canPublishPrivateNote = false,
  isSavingBeforeShare = false,
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
  boardInteractionBlocked,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = false,
  ideaMapWorkspaceControls,
  ideaMapIsDragging = false,
  onIdeaMapResize = () => undefined,
  voteRemaining,
  selectedVoteKind,
  pendingVoteOperations,
  dragGhost,
  dragPreview = null,
  isReturnDropTarget,
  privateDropPlaceholder,
  boardScrollerRef,
  ideaMapPlaneRef,
  privateToolbarRef,
  permissions,
  camera,
  displayZoom,
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
  expandPrivateNotesRequest = 0,
  addPrivateNoteRequest = 0,
  privateNoteAddRef,
}: RoomBoardCanvasProps) {
  const [ideaMapViewportZoom, setIdeaMapViewportZoom] = useState(1);
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
  // 3-2から固定2軸マップで共有・配置し、投票・決定まで同じ表示を引き継ぐ。
  // 配置済みの付箋がある3-1再訪時は従来どおり閲覧のみできる。
  const isIdeaValueFeasibilityMapVisible =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step >= 2 || notes.length > 0);
  const isIdeaMapWorkspaceStep =
    isPhaseStep(phase, 3, 2) || isPhaseStep(phase, 3, 3);
  const usesIdeaMapViewport = isIdeaMapViewportStep(phase);
  const ideaMapNoteDisplayScale = getIdeaMapNoteDisplayScale(ideaMapSizeLevel);
  const isPersonalNoteEntryPhase =
    phase.kind === "step" && phase.step === 1 && phase.phase <= 3;
  const privateNotesContainerClassName = isPersonalNoteEntryPhase
    ? "absolute inset-x-0 top-[min(var(--board-private-workspace-top,12rem),calc(100%-20rem))] bottom-24 z-30 flex min-h-0 justify-center px-3 py-2 min-[640px]:left-96 max-[639px]:top-[min(var(--board-private-workspace-top,12rem),calc(100%-8rem))] max-[639px]:bottom-8"
    : `pointer-events-none absolute right-3 bottom-[5.25rem] top-[4.5rem] min-[640px]:group-data-[connection-status=closed]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=connecting]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=reconnecting]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=auth-required]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] min-[640px]:group-data-[connection-status=unavailable]/board:top-[max(7.5rem,var(--board-connection-notice-bottom,0px))] z-30 flex w-[min(15rem,calc(100vw-1.5rem))] items-end max-[639px]:top-auto max-[639px]:h-[var(--board-private-dock-height,20rem)] ${moveHistory ? "max-[639px]:bottom-[var(--board-private-dock-bottom)] max-[639px]:max-h-[max(0px,calc(100%-var(--board-private-dock-bottom)-16.5rem))]" : isHost && phase.kind === "step" && phase.step === 2 ? "max-[639px]:bottom-[var(--board-private-dock-bottom,11.5rem)] max-[639px]:max-h-[calc(100%-16rem)]" : "max-[639px]:bottom-[var(--board-private-dock-bottom,7.5rem)] max-[639px]:max-h-[calc(100%-12rem)]"}`;
  const adoptionPointerNoteIdRef = useRef<string | null>(null);
  const adoptionKeyboardNoteIdRef = useRef<string | null>(null);
  const selectedNote = [...notes, ...privateNotes].find(
    (note) => note.id === selectedNoteId,
  );
  const mapNoteGeometry = getIdeaMapNoteGeometry(
    ideaMapSizeLevel,
    notes.map((note) => getNoteHeight(note.content, note.fontSize)),
  );
  const canvasZoom = usesIdeaMapViewport
    ? ideaMapViewportZoom
    : (displayZoom ?? camera.zoom);
  const zoomOut = () => {
    if (usesIdeaMapViewport) {
      setIdeaMapViewportZoom((zoom) => clampCanvasZoom(zoom / 1.25));
      return;
    }
    onZoomOut();
  };
  const resetZoom = () => {
    if (usesIdeaMapViewport) {
      setIdeaMapViewportZoom(1);
      return;
    }
    onResetZoom();
  };
  const zoomIn = () => {
    if (usesIdeaMapViewport) {
      setIdeaMapViewportZoom((zoom) => clampCanvasZoom(zoom * 1.25));
      return;
    }
    onZoomIn();
  };
  const fitToNotes = () => {
    if (usesIdeaMapViewport) {
      // 固定マップは既定で表示領域にフィットするため、全体表示は等倍へ戻す。
      setIdeaMapViewportZoom(1);
      return;
    }
    onFitToNotes();
  };

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
        maxDisplayHeight={
          maxDisplayHeight ??
          (usesIdeaMapViewport
            ? IDEA_MAP_VIEWPORT_NOTE_HEIGHT_LIMIT
            : isIdeaValueFeasibilityMapVisible
              ? mapNoteGeometry.noteHeightLimit
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
          !boardInteractionBlocked &&
          permissions.canDeleteNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canEditNote={
          !boardInteractionBlocked &&
          permissions.canEditNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canMoveNote={!boardInteractionBlocked && permissions.canMoveNote}
        canExcludeNote={
          !boardInteractionBlocked &&
          !isAdoptMode &&
          !isMultiSelected &&
          interactionTool === "select" &&
          permissions.canExcludeNote &&
          !note.excluded
        }
        canRestoreNote={
          !boardInteractionBlocked &&
          !isAdoptMode &&
          !isMultiSelected &&
          interactionTool === "select" &&
          permissions.canRestoreNote &&
          note.excluded
        }
        candidatePending={pendingCandidateNoteIds.includes(note.id)}
        isDecided={decision?.noteId === note.id}
        isAdoptionFocused={
          adoptionFocusNoteId === note.id && decision?.noteId !== note.id
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
          canVote:
            !boardInteractionBlocked && permissions.canVote && !note.excluded,
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

  const canvasZoomControls = (
    <CanvasZoomControls
      reactionControls={reactionControls}
      moveHistory={moveHistory}
      showNavigationControls
      interactionTool={interactionTool}
      onToolChange={isIdeaMapWorkspaceStep ? undefined : onToolChange}
      toolDisabled={toolDisabled}
      zoom={canvasZoom}
      onZoomOut={zoomOut}
      onResetZoom={resetZoom}
      onZoomIn={zoomIn}
      onFitToNotes={fitToNotes}
    />
  );

  function renderPositionedNote(note: Note) {
    const ideaMapNoteMetrics = usesIdeaMapViewport
      ? getIdeaMapNoteDisplayMetrics(note, ideaMapSizeLevel)
      : null;
    const ideaMapResponsivePositions = ideaMapNoteMetrics
      ? getIdeaMapViewportNoteResponsivePositions(
          { value: note.y, feasibility: note.x },
          ideaMapNoteMetrics.unscaledHeight,
          ideaMapNoteMetrics.displayScale,
        )
      : null;
    const position = usesIdeaMapViewport
      ? { left: "0%", bottom: "0%" }
      : isIdeaValueFeasibilityMapVisible
        ? getIdeaValueFeasibilityMapNotePosition(
            { value: note.y, feasibility: note.x },
            getNoteHeight(note.content, note.fontSize),
            mapNoteGeometry,
          )
        : { left: note.x, top: note.y };
    const ideaMapPositionVariables = ideaMapResponsivePositions
      ? ({
          "--idea-map-note-left-compact":
            ideaMapResponsivePositions.compact.left,
          "--idea-map-note-bottom-compact":
            ideaMapResponsivePositions.compact.bottom,
          "--idea-map-note-left-tablet": ideaMapResponsivePositions.tablet.left,
          "--idea-map-note-bottom-tablet":
            ideaMapResponsivePositions.tablet.bottom,
          "--idea-map-note-left-desktop":
            ideaMapResponsivePositions.desktop.left,
          "--idea-map-note-bottom-desktop":
            ideaMapResponsivePositions.desktop.bottom,
        } as CSSProperties)
      : {};
    const isAdoptTarget =
      !boardInteractionBlocked &&
      isAdoptMode &&
      interactionTool === "select" &&
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
        className={`isolate pointer-events-auto absolute ${usesIdeaMapViewport ? `${styles.ideaMapNotePosition} transition-transform duration-200 ease-out motion-reduce:transition-none` : ""}`}
        data-testid={
          isIdeaValueFeasibilityMapVisible
            ? `idea-value-feasibility-map-note-${note.id}`
            : `board-note-${note.id}`
        }
        data-map-x={usesIdeaMapViewport ? note.x : undefined}
        data-map-y={usesIdeaMapViewport ? note.y : undefined}
        style={{
          ...(!usesIdeaMapViewport ? position : {}),
          ...ideaMapPositionVariables,
          zIndex: isTemporarilyFront
            ? TEMPORARY_FRONT_Z_INDEX
            : note.excluded
              ? 0
              : note.stackOrder,
          ...(usesIdeaMapViewport
            ? {
                transform: `scale(${ideaMapNoteMetrics?.displayScale ?? ideaMapNoteDisplayScale})`,
                transformOrigin:
                  "var(--idea-map-note-transform-origin, 50% 50%)",
              }
            : {}),
        }}
      >
        {renderNoteCard(
          note,
          ideaMapNoteMetrics?.unscaledHeight,
          usesIdeaMapViewport ? "responsive-map" : 1,
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
    if (!usesIdeaMapViewport) {
      const position = getIdeaValueFeasibilityMapNotePosition(
        { value: dragGhost.y, feasibility: dragGhost.x },
        getNoteHeight(dragGhost.note.content, dragGhost.note.fontSize),
        mapNoteGeometry,
      );
      return (
        <StickyNote
          noteId={dragGhost.note.id}
          isLifted
          color={dragGhost.note.color}
          height={Math.min(
            mapNoteGeometry.noteHeightLimit,
            getNoteHeight(dragGhost.note.content, dragGhost.note.fontSize),
          )}
          className="pointer-events-none absolute"
          style={{ ...position, zIndex: TEMPORARY_FRONT_Z_INDEX }}
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
    const ghostMetrics = getIdeaMapNoteDisplayMetrics(
      dragGhost.note,
      ideaMapSizeLevel,
    );
    const responsivePositions = getIdeaMapViewportNoteResponsivePositions(
      { value: dragGhost.y, feasibility: dragGhost.x },
      ghostMetrics.unscaledHeight,
      ghostMetrics.displayScale,
    );
    const positionVariables = {
      "--idea-map-note-left-compact": responsivePositions.compact.left,
      "--idea-map-note-bottom-compact": responsivePositions.compact.bottom,
      "--idea-map-note-left-tablet": responsivePositions.tablet.left,
      "--idea-map-note-bottom-tablet": responsivePositions.tablet.bottom,
      "--idea-map-note-left-desktop": responsivePositions.desktop.left,
      "--idea-map-note-bottom-desktop": responsivePositions.desktop.bottom,
    } as CSSProperties;

    return (
      <div
        className={`pointer-events-none absolute ${styles.ideaMapNotePosition} transition-transform duration-200 ease-out motion-reduce:transition-none`}
        data-testid="idea-map-drag-ghost"
        style={{
          ...positionVariables,
          zIndex: TEMPORARY_FRONT_Z_INDEX,
          transform: `scale(${ghostMetrics.displayScale})`,
          transformOrigin: "var(--idea-map-note-transform-origin, 50% 50%)",
        }}
      >
        <StickyNote
          noteId={dragGhost.note.id}
          isLifted
          color={dragGhost.note.color}
          height={ghostMetrics.unscaledHeight}
          className="pointer-events-none relative"
          style={{
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
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <div
        className={
          usesIdeaMapViewport
            ? "relative flex h-full min-h-0 flex-row max-[639px]:flex-col"
            : "relative h-full min-h-80"
        }
        data-testid="board-frame"
        data-map-workspace={usesIdeaMapViewport || undefined}
      >
        <div
          className="pointer-events-none absolute bottom-3 left-3 z-40 flex has-[[data-canvas-help][open]]:z-50 max-w-[calc(100%-1.5rem)] flex-col items-start gap-2"
          data-testid="board-tools-hud"
          data-board-fit-edge="bottom"
          hidden={isPersonalNoteEntryPhase}
        >
          <div
            className={`flex items-center gap-2 ${usesIdeaMapViewport ? "min-w-[122px]" : ""}`}
            data-testid={
              usesIdeaMapViewport ? "idea-map-axis-low-anchor" : undefined
            }
          >
            {permissions.canEditNote ? (
              <NoteFontSizeControls
                fontSize={
                  selectedNote?.fontSize ??
                  (isIdeaMapWorkspaceStep ? NOTE_DEFAULT_FONT_SIZE : null)
                }
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
          <div
            data-testid="canvas-zoom-hud"
            className="flex max-w-full items-center gap-2"
          >
            {canvasZoomControls}
            <span aria-live="polite" className="sr-only">
              {selectionIds.length > 0
                ? `選択した付箋：${selectionIds.length}枚`
                : ""}
            </span>
          </div>
        </div>
        <div
          className={
            usesIdeaMapViewport
              ? "relative min-h-0 min-w-0 flex-1"
              : "absolute inset-0"
          }
          hidden={isPersonalNoteEntryPhase}
        >
          <div
            ref={boardScrollerRef}
            // マップより長い付箋も読む。マップ平面の外へ出た本文はカメラ側で視野を切る。
            className={`relative h-full ${usesIdeaMapViewport ? "overflow-visible bg-background" : "overflow-clip bg-muted/20"} [container-type:size] [&_[data-coordinate-range='0-100']]:overflow-visible ${
              isIdeaMapWorkspaceStep
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
              usesIdeaMapViewport
                ? isIdeaMapWorkspaceStep
                  ? "付箋を2軸マップ内でドラッグして配置します。マップの位置と大きさは固定です。"
                  : "マップの位置と大きさは固定です。手のひらツールではマップを移動できません。"
                : "背景でVは選択、Hは手のひら。Spaceとドラッグで画面移動"
            }
            data-selection-count={selectionIds.length}
            data-adopt-mode={isAdoptMode || undefined}
            style={
              usesIdeaMapViewport ? { backgroundImage: "none" } : gridStyle
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
            {usesIdeaMapViewport ? (
              <IdeaMapViewport
                planeRef={ideaMapPlaneRef}
                workspace
                expanded={phase.kind === "step" && phase.step >= 3}
                workspaceControls={
                  isIdeaMapWorkspaceStep
                    ? (ideaMapWorkspaceControls ?? {
                        phaseLoop: null,
                        mapSize: (
                          <IdeaMapSizeControls
                            sizeLevel={ideaMapSizeLevel}
                            initialized={ideaMapSizeInitialized}
                            isHost={isHost}
                            isDisconnected={isDisconnected}
                            isDragging={ideaMapIsDragging}
                            onResize={onIdeaMapResize}
                          />
                        ),
                      })
                    : undefined
                }
                groupHorizontalAxisEndpoint={usesIdeaMapViewport}
                zoom={ideaMapViewportZoom}
                overlay={remoteCursors.map((cursor) => (
                  <RemoteCursor
                    key={cursor.userId}
                    cursor={cursor}
                    isIdle={cursor.isIdle}
                    labelOffset={getCursorLabelOffset(cursor.userId)}
                    className="z-[2147483647]"
                    style={{
                      left: `${cursor.x}%`,
                      bottom: `${cursor.y}%`,
                      transform: "none",
                    }}
                  />
                ))}
              >
                {orderedNotes.map(renderPositionedNote)}
                {renderIdeaMapDragGhost()}
              </IdeaMapViewport>
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
                transform: usesIdeaMapViewport
                  ? "none"
                  : `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
                transformOrigin: "0 0",
                willChange: usesIdeaMapViewport ? "auto" : "transform",
              }}
            >
              {isIdeaValueFeasibilityMapVisible && !usesIdeaMapViewport ? (
                <IdeaValueFeasibilityMap
                  planeRef={ideaMapPlaneRef}
                  sizeLevel={ideaMapSizeLevel}
                  overlay={remoteCursors.map((cursor) => (
                    <RemoteCursor
                      key={cursor.userId}
                      cursor={cursor}
                      isIdle={cursor.isIdle}
                      labelOffset={getCursorLabelOffset(cursor.userId)}
                      className="z-[2147483647]"
                      style={{
                        left: `${cursor.x}%`,
                        bottom: `${cursor.y}%`,
                        transform: "none",
                      }}
                    />
                  ))}
                >
                  {orderedNotes.map(renderPositionedNote)}
                  {renderIdeaMapDragGhost()}
                </IdeaValueFeasibilityMap>
              ) : null}
              {renderGroups.map((rg) => {
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
                    canGroupNote={
                      !boardInteractionBlocked && permissions.canGroupNote
                    }
                    onUpdateName={handleUpdateName}
                  />
                );
              })}

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
        </div>
        {usesIdeaMapViewport ? (
          <div
            className={`${styles.ideaMapRail} relative z-30 shrink-0 -translate-x-3 max-[639px]:hidden`}
            data-testid="idea-map-workspace-rail"
            aria-hidden="true"
          />
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
                  width:
                    dragPreview.noteDisplayScale === undefined
                      ? dragPreview.width
                      : NOTE_WIDTH,
                  height: dragPreview.unscaledNoteHeight ?? dragPreview.height,
                  ...(dragPreview.noteDisplayScale === undefined
                    ? {}
                    : {
                        transform: `scale(${dragPreview.noteDisplayScale})`,
                        transformOrigin: "top left",
                      }),
                }}
              >
                <p
                  className={`min-h-0 flex-1 overflow-hidden p-2 text-slate-900 ${dragPreview.noteDisplayScale === undefined ? "text-sm" : ""}`}
                  style={
                    dragPreview.noteDisplayScale === undefined
                      ? undefined
                      : {
                          fontSize: `${dragPreview.note.fontSize}px`,
                          lineHeight: `${Math.ceil(dragPreview.note.fontSize * 1.5)}px`,
                        }
                  }
                >
                  {dragPreview.note.content || "メモを入力..."}
                </p>
              </StickyNote>,
              document.body,
            )
          : null}
        <div
          className="pointer-events-auto absolute right-3 bottom-3 z-40 max-[639px]:bottom-[var(--board-operation-bottom,4.5rem)]"
          data-testid="board-operation-matrix"
          data-board-fit-edge="bottom"
          hidden={isPersonalNoteEntryPhase}
        >
          <BoardOperationMatrix permissions={permissions} />
        </div>
        {permissions.showPrivateToolbar ? (
          <div
            className={`${privateNotesContainerClassName} ${isIdeaMapWorkspaceStep ? "min-[640px]:w-56" : ""}`}
            data-testid={
              isPersonalNoteEntryPhase
                ? "private-notes-workspace"
                : "private-notes-dock"
            }
            data-board-fit-edge={
              isPersonalNoteEntryPhase ? undefined : "bottom"
            }
          >
            <PrivateNotesToolbar
              rollbackRevision={rollbackRevision}
              notes={privateNotes}
              disabled={isDisconnected}
              canDeleteNote={
                !boardInteractionBlocked && permissions.canDeleteNote
              }
              canCreateNote={
                !boardInteractionBlocked &&
                permissions.canCreateNote &&
                noteCreationSupported
              }
              noteCreationPending={noteCreationPending}
              noteCreationReceipt={noteCreationReceipt}
              noteCreationFocusContext={noteCreationFocusContext}
              canEditNote={!boardInteractionBlocked && permissions.canEditNote}
              canMoveNote={!boardInteractionBlocked && permissions.canMoveNote}
              sharingHint={
                isSavingBeforeShare
                  ? "本文の保存を確認してから共有します…"
                  : isPhaseStep(phase, 3, 2)
                    ? canPublishPrivateNote
                      ? "あなたの番です。付箋を2軸マップへドラッグして共有できます。"
                      : "付箋の共有は、自分の番になるまでお待ちください。"
                    : phase.kind === "step" && phase.step === 2
                      ? canPublishPrivateNote
                        ? "あなたの番です。付箋をボードへドラッグして共有できます。"
                        : "付箋の共有は、自分の番になるまでお待ちください。"
                      : undefined
              }
              presentation={isPersonalNoteEntryPhase ? "workspace" : "dock"}
              editingDisabled={isResultStep(phase)}
              defaultExpanded={
                (phase.kind === "step" &&
                  phase.step === 1 &&
                  phase.phase <= 3) ||
                isPhaseStep(phase, 3, 2)
              }
              expandRequest={expandPrivateNotesRequest}
              addRequest={addPrivateNoteRequest}
              addActionRef={privateNoteAddRef}
              className={
                isPersonalNoteEntryPhase
                  ? "pointer-events-auto h-full w-full"
                  : `pointer-events-auto max-h-full ${isIdeaMapWorkspaceStep ? "min-[640px]:w-56" : ""}`
              }
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
