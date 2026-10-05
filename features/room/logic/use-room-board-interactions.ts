"use client";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useEffect, useMemo, useRef } from "react";
import { getNoteHeight } from "@/contracts/board";
import {
  isPhaseStep,
  isPublishAllowedStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { Note } from "@/features/notes";
import { getBoardPermissions } from "./board-permissions";
import {
  type CanvasCamera,
  type CanvasFitInsets,
  clampCanvasCoordinate,
} from "./canvas-camera";
import {
  clampIdeaValueFeasibilityMapCoordinate,
  getIdeaMapNoteGeometry,
  getIdeaValueFeasibilityMapPointFromClientPosition,
} from "./idea-value-feasibility-map";
import { roomNotify } from "./room-notify";
import { useBoardDrag } from "./use-board-drag";
import { useCanvasCamera } from "./use-canvas-camera";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";

export type UseRoomBoardInteractionsArgs = {
  getFitInsets?: (viewport: HTMLDivElement) => CanvasFitInsets;
  notes: Note[];
  selectedNoteIds?: readonly string[];
  movePending?: boolean;
  onPendingMoveInterrupt?: () => void;
  privateNotes: Note[];
  currentUserId: string;
  draggingNoteId: string | null;
  phase: RoomPhase;
  isDecided?: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  onNoteDragStart: (
    noteId: string,
    privateMapLock?: boolean,
    selectedNoteIds?: readonly string[],
  ) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onNoteDragCancel: (noteId: string) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onPrivateNoteUnpublish: (
    noteId: string,
    privateIndex: number,
    preserveDragUntilPointerEnd?: boolean,
  ) => void;
  onCursorMove: (
    point: { x: number; y: number },
    draggingNoteId: string | null,
  ) => void;
  onCursorLeave: () => void;
};

export type RoomBoardInteractions = {
  boardRootRef: RefObject<HTMLDivElement | null>;
  boardScrollerRef: RefObject<HTMLDivElement | null>;
  ideaMapPlaneRef: RefObject<HTMLDivElement | null>;
  privateToolbarRef: RefObject<HTMLDivElement | null>;
  notes: Note[];
  privateNotes: Note[];
  dragGhost: { note: Note; x: number; y: number } | null;
  dragPreview?: {
    note: Note;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  isReturnDropTarget: boolean;
  privateDropPlaceholder?: { noteId: string };
  isNoteDragging: boolean;
  localDraggingNoteId?: string | null;
  camera: CanvasCamera;
  gridStyle: CSSProperties;
  isPanning: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToolChange?: (tool: "select" | "hand") => void;
  onGestureBlockedChange?: (blocked: boolean) => void;
  hasPan?: () => boolean;
  cancelPan?: () => void;
  consumePanClick?: () => boolean;
  onSharedNotesDragIntent?: (
    noteIds: readonly string[],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToNotes: (insets?: CanvasFitInsets) => boolean | undefined;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCaptureLost?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  cancelCurrentNoteDrag: (includePrivate?: boolean) => void;
  onPresencePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    origin?: { clientX: number; clientY: number },
  ) => void;
  onPrivateNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function useRoomBoardInteractions({
  getFitInsets,
  notes,
  selectedNoteIds,
  movePending = false,
  onPendingMoveInterrupt,
  privateNotes,
  currentUserId,
  draggingNoteId,
  phase,
  isDecided = false,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = true,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
  onNoteDragCancel,
  onPrivateNotePublish,
  onPrivateNoteUnpublish,
  onCursorMove,
  onCursorLeave,
}: UseRoomBoardInteractionsArgs): RoomBoardInteractions {
  const boardRootRef = useRef<HTMLDivElement>(null);
  const boardScrollerRef = useRef<HTMLDivElement>(null);
  const privateToolbarRef = useRef<HTMLDivElement>(null);

  const {
    camera,
    gridStyle,
    isPanning,
    worldPointFromClient,
    fitToNotes,
    zoomIn,
    zoomOut,
    resetZoom,
    setInteractionTool,
    setGestureBlocked,
    hasPan,
    cancelPan,
    consumePanClick,
    handlePointerDown: onCanvasPointerDown,
    handlePointerMove: onCanvasPointerMove,
    handlePointerEnd: onCanvasPointerEnd,
  } = useCanvasCamera({
    viewportRef: boardScrollerRef,
    getFitInsets,
    notes,
    fitViewport:
      phase.kind === "step" &&
      phase.phase === 3 &&
      (phase.step >= 2 || notes.length > 0),
    ideaMapSizeLevel,
    ideaMapSizeInitialized,
  });

  const mapNoteGeometry = useMemo(
    () =>
      getIdeaMapNoteGeometry(
        ideaMapSizeLevel ?? 0,
        notes.map((note) => getNoteHeight(note.content, note.fontSize)),
      ),
    [ideaMapSizeLevel, notes],
  );
  const {
    ideaMapPlaneRef,
    isIdeaValueFeasibilityMappingStep,
    pointFromClient,
  } = useIdeaValueFeasibilityMapInput({
    phase,
    geometry: mapNoteGeometry,
    fallbackPointFromClient: worldPointFromClient,
  });
  // 2軸マップの配置ステップは明示的に移動を許可する。その他の通常ボードは
  // 既存のボード権限に従い、投票・結果ステップでは共有付箋を操作させない。
  const canMoveSharedNotes =
    !movePending &&
    getBoardPermissions(phase, isDecided).canMoveNote &&
    (!isIdeaValueFeasibilityMappingStep ||
      mapNoteGeometry.height > mapNoteGeometry.maxNoteHeight);
  const isIdeaMapCursorSurface =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step >= 2 || notes.length > 0);

  const {
    drag,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel,
    cancelCurrentNoteDrag,
    isCurrentDragPointer,
    isPointerInPrivateDropArea,
  } = useBoardDrag({
    notes,
    selectedNoteIds,
    privateNotes,
    currentUserId,
    boardScrollerRef,
    worldPointFromClient: pointFromClient,
    privateToolbarRef,
    preservePrivateGrabOffset: !isIdeaValueFeasibilityMappingStep,
    clampCoordinate: isIdeaValueFeasibilityMappingStep
      ? clampIdeaValueFeasibilityMapCoordinate
      : undefined,
    canMoveSharedNotes,
    canPublish: isPublishAllowedStep(phase),
    lockPrivateMapDrag: isPhaseStep(phase, 3, 2) && isPublishAllowedStep(phase),
    onPublishBlocked: roomNotify.cannotPublishNote,
    onNoteDragStart,
    onNoteDragMove,
    onNoteDragEnd,
    onNoteDragCancel,
    onPrivateNotePublish,
    onPrivateNoteUnpublish,
  });

  useEffect(() => {
    const interrupt = () => {
      cancelCurrentNoteDrag(true);
      if (movePending) onPendingMoveInterrupt?.();
      onCursorLeave();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") interrupt();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", interrupt);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", interrupt);
    };
  }, [
    cancelCurrentNoteDrag,
    movePending,
    onPendingMoveInterrupt,
    onCursorLeave,
  ]);

  const dragGhost =
    drag?.status === "shared" && !notes.some((note) => note.id === drag.note.id)
      ? { note: drag.note, x: drag.x, y: drag.y }
      : null;
  const dragPreview =
    drag?.status === "private" || drag?.status === "returning"
      ? (() => {
          const preview = {
            note: drag.note,
            left: drag.clientX - drag.previewOffsetX,
            top: drag.clientY - drag.previewOffsetY,
            width: drag.previewWidth,
            height: drag.previewHeight,
          };
          const toolbarBounds =
            privateToolbarRef.current?.getBoundingClientRect();
          const isPointerOverToolbar =
            toolbarBounds !== undefined &&
            drag.clientX >= toolbarBounds.left &&
            drag.clientX <= toolbarBounds.right &&
            drag.clientY >= toolbarBounds.top &&
            drag.clientY <= toolbarBounds.bottom;
          if (!toolbarBounds || !isPointerOverToolbar) return preview;

          const listBounds = privateToolbarRef.current
            ?.querySelector<HTMLElement>("[data-testid='private-notes-scroll']")
            ?.getBoundingClientRect();
          const bounds =
            listBounds && listBounds.width > 0 && listBounds.height > 0
              ? listBounds
              : toolbarBounds;
          const clampWithin = (
            position: number,
            start: number,
            end: number,
            size: number,
          ) => Math.min(Math.max(position, start), Math.max(start, end - size));

          return {
            ...preview,
            left: clampWithin(
              preview.left,
              bounds.left,
              bounds.right,
              preview.width,
            ),
            top: clampWithin(
              preview.top,
              bounds.top,
              bounds.bottom,
              preview.height,
            ),
          };
        })()
      : null;

  const toolbarNotes = renderedPrivateNotes.filter(
    (note) =>
      !(note.id === drag?.note.id && drag.status === "shared") &&
      note.id !== draggingNoteId,
  );

  const presencePointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement;
    if (
      event.pointerType === "touch" ||
      target.closest(
        "input, textarea, select, [contenteditable='true'], [data-cursor-private='true']",
      )
    ) {
      return null;
    }
    const bounds = boardScrollerRef.current?.getBoundingClientRect();
    if (
      !bounds ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return null;
    }
    const mapBounds = ideaMapPlaneRef.current?.getBoundingClientRect();
    const mapPoint =
      isIdeaMapCursorSurface && mapBounds
        ? getIdeaValueFeasibilityMapPointFromClientPosition(
            event.clientX,
            event.clientY,
            mapBounds,
            false,
          )
        : null;
    const point = isIdeaMapCursorSurface
      ? mapPoint
        ? { x: mapPoint.feasibility, y: mapPoint.value }
        : null
      : pointFromClient(event.clientX, event.clientY);
    if (!point) return null;
    // presenceだけはマップ外を許可する。付箋の評価座標の制約とは分ける。
    return {
      x: clampCanvasCoordinate(point.x),
      y: clampCanvasCoordinate(point.y),
    };
  };

  const handlePresencePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isCurrentDragPointer(event.pointerId)) return;
    const point = presencePointFromPointer(event);
    if (!point) {
      onCursorLeave();
      return;
    }
    onCursorMove(
      point,
      drag?.status === "shared" && draggingNoteId === drag.note.id
        ? drag.note.id
        : null,
    );
  };

  const handleBoardPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlePointerEnd(event);
    const point = presencePointFromPointer(event);
    if (point) {
      // ドラッグ終了は次の pointermove を待たず、操作対象を即座に解除する。
      onCursorMove(point, null);
    } else {
      onCursorLeave();
    }
  };

  function handlePresencePointerLeave(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!isCurrentDragPointer(event.pointerId)) return;
    if (event.type === "pointercancel") {
      onCursorLeave();
      cancelCurrentNoteDrag();
      return;
    }
    if (isPointerInPrivateDropArea(event.clientX, event.clientY)) {
      return;
    }
    onCursorLeave();
    cancelCurrentNoteDrag();
  }

  return {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: renderedNotes,
    privateNotes: toolbarNotes,
    dragGhost,
    dragPreview,
    isReturnDropTarget:
      (drag?.status === "shared" || drag?.status === "returning") &&
      drag.note.authorId === currentUserId,
    privateDropPlaceholder:
      (drag?.status === "private" || drag?.status === "returning") &&
      drag.privateDropIndex !== null
        ? { noteId: drag.note.id }
        : undefined,
    isNoteDragging: drag !== null,
    localDraggingNoteId: drag?.note.id ?? null,
    camera,
    gridStyle,
    isPanning,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerEnd,
    onToolChange: setInteractionTool,
    onGestureBlockedChange: setGestureBlocked,
    hasPan,
    cancelPan,
    consumePanClick,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: resetZoom,
    onFitToNotes: fitToNotes,
    onPointerMove: handlePointerMove,
    onPointerEnd: handleBoardPointerEnd,
    onPointerCancel: handlePointerCancel,
    onPointerCaptureLost: (event) => {
      // NoteCardからscrollerへの通常移管はchildのlostcaptureがbubbleする。
      if (event.target !== event.currentTarget) return;
      handlePointerCancel(event);
      onCursorLeave();
    },
    cancelCurrentNoteDrag,
    onPresencePointerMove: handlePresencePointerMove,
    onPresencePointerLeave: handlePresencePointerLeave,
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: handlePrivateDragStart,
  };
}
