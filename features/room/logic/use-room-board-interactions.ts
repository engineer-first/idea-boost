"use client";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useRef } from "react";
import {
  isPhaseStep,
  isPublishAllowedStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { Note } from "@/features/notes";
import { getBoardPermissions } from "./board-permissions";
import { type CanvasCamera, clampCanvasCoordinate } from "./canvas-camera";
import {
  clampIdeaValueFeasibilityMapCoordinate,
  getIdeaValueFeasibilityMapPointFromClientPosition,
} from "./idea-value-feasibility-map";
import { roomNotify } from "./room-notify";
import { useBoardDrag } from "./use-board-drag";
import { useCanvasCamera } from "./use-canvas-camera";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";

export type UseRoomBoardInteractionsArgs = {
  notes: Note[];
  privateNotes: Note[];
  currentUserId: string;
  draggingNoteId: string | null;
  phase: RoomPhase;
  onNoteDragStart: (noteId: string) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onPrivateNoteUnpublish: (noteId: string) => void;
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
  isReturnDropTarget: boolean;
  isNoteDragging: boolean;
  camera: CanvasCamera;
  gridStyle: CSSProperties;
  isPanning: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToNotes: () => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerLeave: () => void;
  onNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onPrivateNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function useRoomBoardInteractions({
  notes,
  privateNotes,
  currentUserId,
  draggingNoteId,
  phase,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
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
    handlePointerDown: onCanvasPointerDown,
    handlePointerMove: onCanvasPointerMove,
    handlePointerEnd: onCanvasPointerEnd,
  } = useCanvasCamera({
    viewportRef: boardScrollerRef,
    notes,
    fitViewport: phase.kind === "step" && phase.phase === 3 && phase.step >= 2,
  });

  const {
    ideaMapPlaneRef,
    isIdeaValueFeasibilityMappingStep,
    pointFromClient,
  } = useIdeaValueFeasibilityMapInput({
    phase,
    fallbackPointFromClient: worldPointFromClient,
  });
  // 2軸マップの配置ステップは明示的に移動を許可する。その他の通常ボードは
  // 既存のボード権限に従い、投票・結果ステップでは共有付箋を操作させない。
  const canMoveSharedNotes =
    isPhaseStep(phase, 3, 2) ||
    isPhaseStep(phase, 3, 3) ||
    getBoardPermissions(phase).canMoveNote;
  const isIdeaMapCursorSurface =
    phase.kind === "step" && phase.phase === 3 && phase.step >= 2;

  const {
    drag,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
  } = useBoardDrag({
    notes,
    privateNotes,
    currentUserId,
    boardRootRef,
    boardScrollerRef,
    worldPointFromClient: pointFromClient,
    privateToolbarRef,
    preservePrivateGrabOffset: !isIdeaValueFeasibilityMappingStep,
    clampCoordinate: isIdeaValueFeasibilityMappingStep
      ? clampIdeaValueFeasibilityMapCoordinate
      : undefined,
    canMoveSharedNotes,
    canPublish: isPublishAllowedStep(phase),
    onPublishBlocked: roomNotify.cannotPublishNote,
    onNoteDragStart,
    onNoteDragMove,
    onNoteDragEnd,
    onPrivateNotePublish,
    onPrivateNoteUnpublish,
  });

  const dragGhost =
    drag?.status === "shared" && !notes.some((note) => note.id === drag.note.id)
      ? { note: drag.note, x: drag.x, y: drag.y }
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
    const surface = isIdeaMapCursorSurface
      ? ideaMapPlaneRef.current
      : boardScrollerRef.current;
    const bounds = surface?.getBoundingClientRect();
    if (
      !bounds ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return null;
    }
    const mapPoint = isIdeaMapCursorSurface
      ? getIdeaValueFeasibilityMapPointFromClientPosition(
          event.clientX,
          event.clientY,
          bounds,
        )
      : null;
    const point = isIdeaMapCursorSurface
      ? mapPoint
        ? { x: mapPoint.feasibility, y: mapPoint.value }
        : null
      : pointFromClient(event.clientX, event.clientY);
    if (!point) return null;
    const clamp = isIdeaValueFeasibilityMappingStep
      ? clampIdeaValueFeasibilityMapCoordinate
      : clampCanvasCoordinate;
    return { x: clamp(point.x), y: clamp(point.y) };
  };

  const handlePresencePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const point = presencePointFromPointer(event);
    if (!point) {
      onCursorLeave();
      return;
    }
    onCursorMove(point, drag?.status === "shared" ? drag.note.id : null);
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

  return {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: renderedNotes,
    privateNotes: toolbarNotes,
    dragGhost,
    isReturnDropTarget:
      drag?.status === "shared" && drag.note.authorId === currentUserId,
    isNoteDragging: drag !== null,
    camera,
    gridStyle,
    isPanning,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerEnd,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: resetZoom,
    onFitToNotes: fitToNotes,
    onPointerMove: handlePointerMove,
    onPointerEnd: handleBoardPointerEnd,
    onPresencePointerMove: handlePresencePointerMove,
    onPresencePointerLeave: onCursorLeave,
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: handlePrivateDragStart,
  };
}
