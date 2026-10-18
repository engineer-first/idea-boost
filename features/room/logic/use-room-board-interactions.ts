"use client";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getNoteHeight } from "@/contracts/board";
import {
  isPhaseStep,
  isPublishAllowedStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { SharingState } from "@/contracts/room-protocol";
import {
  canPublishNoteInTurn,
  canReturnNoteToPrivateInTurn,
} from "@/contracts/sharing";
import type { Note } from "@/features/notes";
import { getBoardPermissions } from "./board-permissions";
import {
  type CanvasCamera,
  type CanvasFitInsets,
  type CanvasPoint,
  clampCanvasCoordinate,
} from "./canvas-camera";
import {
  clampIdeaValueFeasibilityMapCoordinate,
  getIdeaMapNoteDisplayMetrics,
  getIdeaMapNoteGeometry,
  getIdeaMapViewportNotePointFromClientPosition,
  getIdeaValueFeasibilityMapPointFromClientPosition,
  isIdeaMapViewportStep,
} from "./idea-value-feasibility-map";
import { roomNotify } from "./room-notify";
import { type BoardDrag, useBoardDrag } from "./use-board-drag";
import { useCanvasCamera } from "./use-canvas-camera";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";

export type UseRoomBoardInteractionsArgs = {
  getFitInsets?: (viewport: HTMLDivElement) => CanvasFitInsets;
  notes: Note[];
  selectedNoteIds?: readonly string[];
  movePending?: boolean;
  moveBlocked?: boolean;
  onPendingMoveInterrupt?: () => void;
  privateNotes: Note[];
  currentUserId: string;
  draggingNoteId: string | null;
  phase: RoomPhase;
  sharing?: SharingState | null;
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
    noteDisplayScale?: number;
    unscaledNoteHeight?: number;
  } | null;
  isReturnDropTarget: boolean;
  privateDropPlaceholder?: { noteId: string };
  isNoteDragging: boolean;
  localDraggingNoteId?: string | null;
  camera: CanvasCamera;
  displayZoom?: number;
  onSelectionChange?: (ids: readonly string[]) => void;
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
    origin?: { clientX: number; clientY: number },
    anchorId?: string,
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
    origin?: { clientX: number; clientY: number },
  ) => void;
};

export function useRoomBoardInteractions({
  getFitInsets,
  notes,
  selectedNoteIds,
  movePending = false,
  moveBlocked = movePending,
  onPendingMoveInterrupt,
  privateNotes,
  currentUserId,
  draggingNoteId,
  phase,
  sharing = null,
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
  const usesIdeaMapViewport = isIdeaMapViewportStep(phase);
  const isIdeaValueFeasibilityMapVisible =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step >= 2 || notes.length > 0);

  const {
    camera,
    displayZoom,
    setSelectedNoteIds,
    preserveCamera,
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
    isViewportEnabled: !(
      phase.kind === "step" &&
      phase.step === 1 &&
      phase.phase <= 3
    ),
    getFitInsets,
    notes,
    selectedNoteIds,
    fitViewport:
      phase.kind === "step" &&
      phase.phase === 3 &&
      (phase.step >= 2 || notes.length > 0),
    navigationDisabled: usesIdeaMapViewport,
    ideaMapSizeLevel,
    ideaMapSizeInitialized,
  });
  useEffect(() => {
    if (usesIdeaMapViewport) preserveCamera();
  }, [usesIdeaMapViewport, preserveCamera]);
  const mapNoteGeometry = useMemo(
    () =>
      getIdeaMapNoteGeometry(
        ideaMapSizeLevel,
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
    geometry: usesIdeaMapViewport ? undefined : mapNoteGeometry,
    fallbackPointFromClient: worldPointFromClient,
  });
  const notePositionFromClient = useCallback(
    (clientX: number, clientY: number, drag: BoardDrag): CanvasPoint | null => {
      if (!usesIdeaMapViewport) return null;
      const plane = ideaMapPlaneRef.current;
      if (!plane) return null;
      const rect = plane.getBoundingClientRect();
      const responsiveScaleValue = window
        .getComputedStyle(plane)
        .getPropertyValue("--idea-map-note-scale");
      const parsedResponsiveScale = Number.parseFloat(responsiveScaleValue);
      const responsiveScale =
        Number.isFinite(parsedResponsiveScale) && parsedResponsiveScale > 0
          ? parsedResponsiveScale
          : 1;
      const mapZoom =
        plane.clientWidth > 0 ? rect.width / plane.clientWidth : 1;
      const metrics = getIdeaMapNoteDisplayMetrics(
        drag.note,
        ideaMapSizeLevel,
        responsiveScale,
      );
      const noteWidth = metrics.displayWidth * mapZoom;
      const noteHeight = metrics.displayHeight * mapZoom;
      const point = getIdeaMapViewportNotePointFromClientPosition(
        clientX,
        clientY,
        {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
        { width: noteWidth, height: noteHeight },
        {
          x:
            drag.previewWidth > 0
              ? (drag.previewOffsetX / drag.previewWidth) * noteWidth
              : 0,
          y:
            drag.previewHeight > 0
              ? (drag.previewOffsetY / drag.previewHeight) * noteHeight
              : 0,
        },
      );
      return point ? { x: point.feasibility, y: point.value } : null;
    },
    [ideaMapSizeLevel, usesIdeaMapViewport, ideaMapPlaneRef.current],
  );
  // 固定マップ以外はdevelopの移動権限と、付箋が収まる高さの制約を維持する。
  const canMoveSharedNotes =
    !moveBlocked &&
    getBoardPermissions(phase, isDecided).canMoveNote &&
    (usesIdeaMapViewport ||
      !isIdeaValueFeasibilityMappingStep ||
      mapNoteGeometry.height > mapNoteGeometry.maxNoteHeight);
  const canPublish = canPublishNoteInTurn(phase, sharing, currentUserId);
  const canReturnToPrivate =
    !movePending &&
    isPublishAllowedStep(phase) &&
    canReturnNoteToPrivateInTurn(phase, sharing, currentUserId);
  const isIdeaMapCursorSurface = isIdeaValueFeasibilityMapVisible;

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
    notePositionFromClient: usesIdeaMapViewport
      ? notePositionFromClient
      : undefined,
    canMoveSharedNotes,
    canPublish,
    canReturnToPrivate,
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
          const preview: NonNullable<RoomBoardInteractions["dragPreview"]> = {
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
          if (
            isPhaseStep(phase, 3, 2) &&
            !isPointerOverToolbar &&
            typeof window !== "undefined"
          ) {
            const responsiveScaleValue = ideaMapPlaneRef.current
              ? window
                  .getComputedStyle(ideaMapPlaneRef.current)
                  .getPropertyValue("--idea-map-note-scale")
              : "";
            const parsedResponsiveScale =
              Number.parseFloat(responsiveScaleValue);
            const responsiveScale =
              Number.isFinite(parsedResponsiveScale) &&
              parsedResponsiveScale > 0
                ? parsedResponsiveScale
                : 1;
            const {
              displayHeight,
              unscaledHeight,
              displayScale,
              displayWidth,
            } = getIdeaMapNoteDisplayMetrics(
              drag.note,
              ideaMapSizeLevel,
              responsiveScale,
            );
            const horizontalGrabRatio = drag.previewWidth
              ? drag.previewOffsetX / drag.previewWidth
              : 0;
            const verticalGrabRatio = drag.previewHeight
              ? drag.previewOffsetY / drag.previewHeight
              : 0;

            return {
              ...preview,
              left: drag.clientX - horizontalGrabRatio * displayWidth,
              top: drag.clientY - verticalGrabRatio * displayHeight,
              width: displayWidth,
              height: displayHeight,
              noteDisplayScale: displayScale * responsiveScale,
              unscaledNoteHeight: unscaledHeight,
            };
          }
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
      !(
        note.id === drag?.note.id &&
        (drag.status === "shared" ||
          (drag.status === "private" && drag.privateDropIndex === null))
      ) && note.id !== draggingNoteId,
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
      drag.note.authorId === currentUserId &&
      canReturnToPrivate,
    privateDropPlaceholder:
      (drag?.status === "private" || drag?.status === "returning") &&
      drag.privateDropIndex !== null
        ? { noteId: drag.note.id }
        : undefined,
    isNoteDragging: drag !== null,
    localDraggingNoteId: drag?.note.id ?? null,
    camera,
    displayZoom,
    onSelectionChange: setSelectedNoteIds,
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
    onSharedNotesDragIntent: (ids, event, origin, anchorId) => {
      const id = anchorId ?? ids[0];
      if (id) handleSharedNoteDragStart(id, event, origin, ids);
    },
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: (noteId, event, origin) => {
      // マイ付箋はviewport外にあるためcameraのpointerdownを通らない。
      // 最初のdrop後の自動fitで本人の指定位置と視野を動かさない。
      preserveCamera();
      handlePrivateDragStart(noteId, event, origin);
    },
  };
}
