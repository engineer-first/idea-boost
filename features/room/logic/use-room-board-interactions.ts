"use client";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getNoteHeight } from "@/contracts/board";
import { isPhaseStep, type RoomPhase } from "@/contracts/phase";
import type { SharingState } from "@/contracts/room-protocol";
import { canPublishNoteInTurn } from "@/contracts/sharing";
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
import { type BoardDrag, useBoardDrag } from "./use-board-drag";
import { useCanvasCamera } from "./use-canvas-camera";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";
import type { RemotePresenterView } from "./use-presenter-view";

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
  isAdditionalWriting?: boolean;
  sharing?: SharingState | null;
  isDecided?: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  onNoteDragStart: (
    noteId: string,
    selectedNoteIds?: readonly string[],
  ) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onNoteDragCancel: (noteId: string) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onCursorMove: (
    point: { x: number; y: number },
    draggingNoteId: string | null,
  ) => void;
  onCursorLeave: () => void;
  presenterView?: RemotePresenterView | null;
  isFollowingPresenter?: boolean;
  onManualPanStart?: () => void;
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
    clipPath?: string;
  } | null;
  privateDropPlaceholder?: { noteId: string };
  /** 自分の番でない人がマイ付箋を一覧の外へ運ぼうとしている間 true。 */
  privateNotePublishBlocked?: boolean;
  isNoteDragging: boolean;
  hasActiveNoteDrag?: (pointerId: number) => boolean;
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
    event: ReactPointerEvent<HTMLElement>,
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
    event: ReactPointerEvent<HTMLElement>,
    origin?: { clientX: number; clientY: number },
  ) => void;
  onPrivateNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLElement>,
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
  isAdditionalWriting = false,
  sharing = null,
  isDecided = false,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = true,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
  onNoteDragCancel,
  onPrivateNotePublish,
  onCursorMove,
  onCursorLeave,
  presenterView = null,
  isFollowingPresenter = true,
  onManualPanStart,
}: UseRoomBoardInteractionsArgs): RoomBoardInteractions {
  const boardRootRef = useRef<HTMLDivElement>(null);
  const boardScrollerRef = useRef<HTMLDivElement>(null);
  const privateToolbarRef = useRef<HTMLDivElement>(null);
  const usesIdeaMapViewport = isIdeaMapViewportStep(phase);
  const presenterViewRef = useRef<RemotePresenterView | null>(presenterView);
  presenterViewRef.current = presenterView;

  const isFollowingPresenterRef = useRef(isFollowingPresenter);
  isFollowingPresenterRef.current = isFollowingPresenter;

  const zoomRatioRef = useRef<number | null>(null);
  const lastPresenterUserIdRef = useRef<string | null>(null);
  const wasFollowingRef = useRef(false);

  const handleCameraZoomChange = useCallback((zoom: number) => {
    const view = presenterViewRef.current?.view;

    if (
      !isFollowingPresenterRef.current ||
      !view ||
      view.coordinateSpace !== "canvas" ||
      view.zoom <= 0
    ) {
      return;
    }

    zoomRatioRef.current = zoom / view.zoom;
  }, []);
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
    cameraRef,
    followWorldCenter,
    cancelFollowAnimation,
    handlePointerDown: onCanvasPointerDown,
    handlePointerMove: onCanvasPointerMove,
    handlePointerEnd: onCanvasPointerEnd,
  } = useCanvasCamera({
    viewportRef: boardScrollerRef,
    isViewportEnabled:
      isAdditionalWriting ||
      !(phase.kind === "step" && phase.step === 1 && phase.phase <= 3),
    getFitInsets,
    notes,
    selectedNoteIds,
    fitViewport:
      phase.kind === "step" &&
      phase.phase === 3 &&
      (phase.step >= 2 || notes.length > 0),
    ideaMapFitKey:
      usesIdeaMapViewport && phase.kind === "step"
        ? `${phase.phase}-${phase.step}`
        : undefined,
    // 発表の順番が変わると上の案内が入れ替わるので、まだ動かしていなければ合わせ直す。
    ideaMapRefitKey: usesIdeaMapViewport
      ? `${sharing?.status ?? "none"}:${sharing?.currentIndex ?? "none"}`
      : undefined,
    temporaryView: isAdditionalWriting,
    panOnBackground: isAdditionalWriting,
    ideaMapSizeLevel,
    ideaMapSizeInitialized,
    onManualPanStart,
    onZoomChange: handleCameraZoomChange,
  });
  useEffect(() => {
    if (usesIdeaMapViewport) preserveCamera();
  }, [usesIdeaMapViewport, preserveCamera]);
  useEffect(() => {
    if (
      !isFollowingPresenter ||
      !presenterView ||
      usesIdeaMapViewport ||
      presenterView.view.coordinateSpace !== "canvas"
    ) {
      if (!isFollowingPresenter || !presenterView || usesIdeaMapViewport) {
        wasFollowingRef.current = false;
        cancelFollowAnimation();
      }
      return;
    }

    const presenterChanged =
      lastPresenterUserIdRef.current !== presenterView.userId;

    // 初回フォロー、または発表者が変わった時点で、
    // 現在の個人ズームを維持する比率を初期化する。
    if (
      presenterChanged ||
      !wasFollowingRef.current ||
      zoomRatioRef.current === null
    ) {
      zoomRatioRef.current = cameraRef.current.zoom / presenterView.view.zoom;
    }

    lastPresenterUserIdRef.current = presenterView.userId;
    wasFollowingRef.current = true;

    const localZoom = presenterView.view.zoom * (zoomRatioRef.current ?? 1);

    followWorldCenter(
      {
        x: presenterView.view.centerX,
        y: presenterView.view.centerY,
      },
      localZoom,
    );
  }, [
    isFollowingPresenter,
    presenterView?.userId,
    presenterView?.view.coordinateSpace,
    presenterView?.view.centerX,
    presenterView?.view.centerY,
    presenterView?.view.zoom,
    usesIdeaMapViewport,
    cameraRef,
    followWorldCenter,
    cancelFollowAnimation,
    presenterView,
  ]);
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
      // ボード上のマップでは付箋の大きさを広さで変えない。拡大率は mapZoom に含まれる。
      const metrics = getIdeaMapNoteDisplayMetrics(
        drag.note,
        ideaMapSizeLevel,
        responsiveScale,
        1,
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
  const isIdeaMapCursorSurface = isIdeaValueFeasibilityMapVisible;

  const {
    drag,
    publishBlocked,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel,
    cancelCurrentNoteDrag,
    isCurrentDragPointer,
    hasActiveDragPointer,
  } = useBoardDrag({
    notes,
    selectedNoteIds,
    privateNotes,
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
    keepPrivateDragInList: phase.kind === "step" && phase.step === 1,
    canPublish,
    onNoteDragStart,
    onNoteDragMove,
    onNoteDragEnd,
    onNoteDragCancel,
    onPrivateNotePublish,
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
    drag?.status === "private"
      ? (() => {
          const preview: NonNullable<RoomBoardInteractions["dragPreview"]> = {
            // 掴んだ後に保存が確定した本文も、運んでいる途中で反映する。
            note:
              privateNotes.find((note) => note.id === drag.note.id) ??
              drag.note,
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
            // マップ上で見える大きさ（ボードの拡大率）で運ぶ。
            const responsiveScale =
              Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
            const {
              displayHeight,
              unscaledHeight,
              displayScale,
              displayWidth,
            } = getIdeaMapNoteDisplayMetrics(
              drag.note,
              ideaMapSizeLevel,
              responsiveScale,
              1,
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
          if (
            !toolbarBounds ||
            (!isPointerOverToolbar &&
              !(phase.kind === "step" && phase.step === 1))
          )
            return preview;

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

          const clipRight = Math.max(
            0,
            preview.width - (bounds.right - bounds.left),
          );
          const clipBottom = Math.max(
            0,
            preview.height - (bounds.bottom - bounds.top),
          );
          return {
            ...preview,
            ...(phase.kind === "step" &&
            phase.step === 1 &&
            (clipRight > 0 || clipBottom > 0)
              ? { clipPath: `inset(0px ${clipRight}px ${clipBottom}px 0px)` }
              : {}),
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
        drag.status === "private" &&
        drag.privateDropIndex === null
      ),
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
    onCursorLeave();
    // ドラッグの終了・中断は pointerup / pointercancel / lostpointercapture / blur / Escape で扱う。
    // scroller からの pointerleave だけでは共有付箋の移動を中断しない。
    if (event.type === "pointercancel") {
      cancelCurrentNoteDrag();
    }
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
    privateDropPlaceholder:
      drag?.status === "private" && drag.privateDropIndex !== null
        ? { noteId: drag.note.id }
        : undefined,
    privateNotePublishBlocked: publishBlocked,
    isNoteDragging: drag !== null,
    hasActiveNoteDrag: hasActiveDragPointer,
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
