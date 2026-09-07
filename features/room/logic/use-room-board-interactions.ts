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
import type { CanvasCamera } from "./canvas-camera";
import { clampIdeaValueFeasibilityMapCoordinate } from "./idea-value-feasibility-map";
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
    onPointerEnd: handlePointerEnd,
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: handlePrivateDragStart,
  };
}
