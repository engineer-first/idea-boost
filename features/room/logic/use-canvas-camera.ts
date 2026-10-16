"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getNoteHeight,
  IDEA_MAP_BASE_DIMENSIONS,
  NOTE_WIDTH,
} from "@/contracts/board";
import type { Note } from "@/features/notes";
import {
  CANVAS_FIT_PADDING,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasFitInsets,
  type CanvasPoint,
  clampCanvasZoom,
  fitCanvasCamera,
  getCanvasGridStep,
  getDefaultCanvasCamera,
  screenToWorld,
  zoomAtScreenPoint,
} from "./canvas-camera";
import { getIdeaValueFeasibilityMapDimensions } from "./idea-value-feasibility-map";

type CanvasPan = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCamera: CanvasCamera;
};

type ScheduledFrame =
  | { type: "animation"; id: number }
  | { type: "timeout"; id: ReturnType<typeof setTimeout> };

type UseCanvasCameraArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  notes: Note[];
  // 固定2軸マップ表示中はボードの視野を動かさない。
  navigationDisabled?: boolean;
  // 画面サイズで配置されたマップでは、0〜100の付箋座標をpxとしてフィットしない。
  fitViewport?: boolean;
  getFitInsets?: (viewport: HTMLDivElement) => CanvasFitInsets;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
};

function viewportSize(element: HTMLDivElement): {
  width: number;
  height: number;
} | null {
  const rect = element.getBoundingClientRect();
  const width = rect.width || element.clientWidth;
  const height = rect.height || element.clientHeight;
  return width > 0 && height > 0 ? { width, height } : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

function notesBounds(notes: Note[]) {
  if (notes.length === 0) return null;
  const minX = Math.min(...notes.map((note) => note.x));
  const minY = Math.min(...notes.map((note) => note.y));
  const maxX = Math.max(...notes.map((note) => note.x + NOTE_WIDTH));
  const maxY = Math.max(
    ...notes.map((note) => note.y + getNoteHeight(note.content, note.fontSize)),
  );
  return {
    x: minX - CANVAS_FIT_PADDING,
    y: minY - CANVAS_FIT_PADDING,
    width: maxX - minX + CANVAS_FIT_PADDING * 2,
    height: maxY - minY + CANVAS_FIT_PADDING * 2,
  };
}

function fitIdeaMapCamera(
  viewport: {
    width: number;
    height: number;
  },
  sizeLevel: number,
): CanvasCamera | null {
  const dimensions = getIdeaValueFeasibilityMapDimensions(sizeLevel);
  const mapBounds: CanvasBounds = {
    x: (viewport.width - IDEA_MAP_BASE_DIMENSIONS.width) / 2,
    y:
      viewport.height / 2 +
      IDEA_MAP_BASE_DIMENSIONS.height / 2 -
      dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
  };
  // 2軸マップと付箋は同じワールド座標にあり、付箋はマップ内へ制約されている。
  // 画面端のガイドや操作HUDの高さを全幅の安全領域として差し引くと、マップが
  // 極端に縮むため、マップ自体をキャンバスの表示領域へフィットする。
  return fitCanvasCamera(mapBounds, viewport);
}

export function useCanvasCamera({
  viewportRef,
  notes,
  navigationDisabled = false,
  fitViewport = false,
  getFitInsets,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = true,
}: UseCanvasCameraArgs) {
  const [camera, setCamera] = useState<CanvasCamera>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const [isPanning, setIsPanning] = useState(false);
  const cameraRef = useRef(camera);
  const notesRef = useRef(notes);
  const getFitInsetsRef = useRef(getFitInsets);
  getFitInsetsRef.current = getFitInsets;
  const panRef = useRef<CanvasPan | null>(null);
  const pendingCameraRef = useRef<CanvasCamera | null>(null);
  const frameRef = useRef<ScheduledFrame | null>(null);
  const hasDefaultedRef = useRef(false);
  const hasFitRef = useRef(false);
  const hasFitIdeaMapRef = useRef(false);
  const ideaMapSizeLevelRef = useRef(ideaMapSizeLevel);
  ideaMapSizeLevelRef.current = ideaMapSizeLevel;
  const spacePressedRef = useRef(false);
  const toolRef = useRef<"select" | "hand">("select");
  const gestureBlockedRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const setCameraImmediately = useCallback((next: CanvasCamera) => {
    cameraRef.current = next;
    pendingCameraRef.current = null;
    setCamera(next);
  }, []);

  const scheduleCamera = useCallback((next: CanvasCamera) => {
    // 以降の付箋追加・公開で初期フィットが走り、ユーザーの操作位置を
    // 不意に上書きしないよう、明示的なカメラ操作を記録する。
    hasFitRef.current = true;
    cameraRef.current = next;
    pendingCameraRef.current = next;
    if (frameRef.current !== null) return;
    const applyPendingCamera = () => {
      frameRef.current = null;
      const pending = pendingCameraRef.current;
      pendingCameraRef.current = null;
      if (pending) setCamera(pending);
    };
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      frameRef.current = {
        type: "animation",
        id: window.requestAnimationFrame(applyPendingCamera),
      };
    } else {
      frameRef.current = {
        type: "timeout",
        id: globalThis.setTimeout(applyPendingCamera, 0),
      };
    }
  }, []);

  const getViewportPoint = useCallback(
    (clientX: number, clientY: number): CanvasPoint | null => {
      const element = viewportRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [viewportRef],
  );

  const worldPointFromClient = useCallback(
    (clientX: number, clientY: number): CanvasPoint | null => {
      const point = getViewportPoint(clientX, clientY);
      return point ? screenToWorld(point, cameraRef.current) : null;
    },
    [getViewportPoint],
  );

  const fitToNotes = useCallback(
    (insets?: CanvasFitInsets): boolean => {
      const element = viewportRef.current;
      if (
        !element ||
        navigationDisabled ||
        gestureBlockedRef.current ||
        panRef.current
      )
        return false;
      const size = viewportSize(element);
      if (!size) return false;
      const safeInsets = insets ?? getFitInsetsRef.current?.(element);
      const bounds = fitViewport ? null : notesBounds(notesRef.current);
      const next = fitViewport
        ? fitIdeaMapCamera(size, ideaMapSizeLevelRef.current)
        : bounds
          ? fitCanvasCamera(bounds, size, undefined, safeInsets)
          : getDefaultCanvasCamera(size);
      if (!next) return false;
      hasFitRef.current = true;
      setCameraImmediately(next);
      return true;
    },
    [fitViewport, navigationDisabled, setCameraImmediately, viewportRef],
  );

  const zoomTo = useCallback(
    (requestedZoom: number, point?: CanvasPoint) => {
      const element = viewportRef.current;
      if (
        !element ||
        navigationDisabled ||
        gestureBlockedRef.current ||
        panRef.current
      )
        return;
      const size = viewportSize(element);
      const insets = getFitInsetsRef.current?.(element);
      const anchor = point ?? {
        x:
          ((insets?.left ?? 0) + (size?.width ?? 0) - (insets?.right ?? 0)) / 2,
        y:
          ((insets?.top ?? 0) + (size?.height ?? 0) - (insets?.bottom ?? 0)) /
          2,
      };
      scheduleCamera(
        zoomAtScreenPoint(cameraRef.current, requestedZoom, anchor),
      );
    },
    [navigationDisabled, scheduleCamera, viewportRef],
  );

  const endPan = useCallback(() => {
    const pan = panRef.current;
    if (!pan) return;
    panRef.current = null;
    setIsPanning(false);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture?.(pan.pointerId)) {
      viewport.releasePointerCapture(pan.pointerId);
    }
  }, [viewportRef]);

  useEffect(() => {
    if (!navigationDisabled) return;
    spacePressedRef.current = false;
    endPan();
  }, [endPan, navigationDisabled]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (!panRef.current) suppressClickRef.current = false;
      if (
        panRef.current ||
        navigationDisabled ||
        gestureBlockedRef.current ||
        isEditableTarget(target) ||
        target.closest("[data-board-native-control]")
      )
        return;
      if (target.closest("[data-testid='note-card']")) {
        // 最初の個人付箋をボードへ出す操作中に初期フィットが重なると、
        // ドロップ位置が飛んで見えるため、この時点で初期フィットを終える。
        hasFitRef.current = true;
      }
      const isBackground =
        event.target === event.currentTarget ||
        target.dataset.canvasBackground === "true";
      if (isBackground && (event.button === 0 || event.button === 1))
        hasFitRef.current = true;
      const shouldPan =
        event.button === 1 ||
        (event.button === 0 &&
          (spacePressedRef.current ||
            toolRef.current === "hand" ||
            (isBackground &&
              (event.pointerType === "touch" || event.pointerType === "pen"))));
      if (!shouldPan) return;
      event.preventDefault();
      // captureフェーズで付箋への伝播を止め、パンと付箋ドラッグの同時開始を防ぐ。
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCamera: cameraRef.current,
      };
      suppressClickRef.current = true;
      setIsPanning(true);
    },
    [navigationDisabled],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      if (event.buttons === 0) {
        endPan();
        return;
      }
      scheduleCamera({
        x: pan.startCamera.x + event.clientX - pan.startClientX,
        y: pan.startCamera.y + event.clientY - pan.startClientY,
        zoom: pan.startCamera.zoom,
      });
    },
    [endPan, scheduleCamera],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      endPan();
    },
    [endPan],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (
        navigationDisabled ||
        gestureBlockedRef.current ||
        panRef.current ||
        isEditableTarget(event.target)
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-board-native-control]")
      )
        return;
      for (
        let inner = event.target instanceof HTMLElement ? event.target : null;
        inner && inner !== viewportRef.current;
        inner = inner.parentElement
      ) {
        const style = getComputedStyle(inner);
        if (
          (/auto|scroll/.test(style.overflowY || style.overflow) &&
            inner.scrollHeight > inner.clientHeight) ||
          (/auto|scroll/.test(style.overflowX || style.overflow) &&
            inner.scrollWidth > inner.clientWidth)
        )
          return;
      }
      event.preventDefault();
      const point = getViewportPoint(event.clientX, event.clientY);
      if (!point) return;
      if (event.ctrlKey || event.metaKey) {
        zoomTo(cameraRef.current.zoom * Math.exp(-event.deltaY * 0.002), point);
        return;
      }
      const deltaX =
        event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
      scheduleCamera({
        ...cameraRef.current,
        x: cameraRef.current.x - deltaX,
        y: cameraRef.current.y - (event.shiftKey ? 0 : event.deltaY),
      });
    },
    [getViewportPoint, navigationDisabled, scheduleCamera, zoomTo, viewportRef],
  );

  useEffect(() => {
    if (
      navigationDisabled ||
      !fitViewport ||
      !ideaMapSizeInitialized ||
      hasFitIdeaMapRef.current
    ) {
      return;
    }
    const element = viewportRef.current;
    const size = element ? viewportSize(element) : null;
    if (size) {
      const next = fitIdeaMapCamera(size, ideaMapSizeLevelRef.current);
      if (next) {
        setCameraImmediately(next);
        hasFitIdeaMapRef.current = true;
      }
    }
  }, [
    fitViewport,
    ideaMapSizeInitialized,
    navigationDisabled,
    setCameraImmediately,
    viewportRef,
  ]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel, viewportRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        navigationDisabled ||
        event.isComposing ||
        event.keyCode === 229 ||
        isEditableTarget(event.target) ||
        gestureBlockedRef.current
      )
        return;
      const target = event.target;
      const viewport = viewportRef.current;
      const isCanvasTarget =
        target instanceof HTMLElement &&
        viewport?.contains(target) &&
        (target === viewport ||
          target.dataset.canvasBackground === "true" ||
          target.dataset.canvasNoteSurface === "true");
      if (event.defaultPrevented && !(event.code === "Space" && isCanvasTarget))
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space" && isCanvasTarget) {
        event.preventDefault();
        spacePressedRef.current = true;
        return;
      }
      // このボードの表示操作にフォーカスした場合だけ読書用のキー操作を受ける。
      // 付箋・投票・メニュー・入力欄のキー操作を横取りしない。
      if (
        !viewport ||
        !(event.target instanceof HTMLElement) ||
        !event.target.closest("[data-testid='canvas-zoom-controls']") ||
        !viewport.parentElement?.contains(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const size = viewportSize(viewport);
      const step = 80;
      const pageStep = (size?.height ?? step) * 0.8;
      const offsets: Partial<Record<string, CanvasPoint>> = {
        ArrowLeft: { x: step, y: 0 },
        ArrowRight: { x: -step, y: 0 },
        ArrowUp: { x: 0, y: step },
        ArrowDown: { x: 0, y: -step },
        PageUp: { x: 0, y: pageStep },
        PageDown: { x: 0, y: -pageStep },
      };
      const delta = offsets[event.key];
      if (!delta) return;
      event.preventDefault();
      scheduleCamera({
        ...cameraRef.current,
        x: cameraRef.current.x + delta.x,
        y: cameraRef.current.y + delta.y,
      });
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        endPan();
      }
    };
    const handleWindowBlur = () => {
      spacePressedRef.current = false;
      endPan();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      if (frameRef.current !== null) {
        const frame = frameRef.current;
        frameRef.current = null;
        if (frame.type === "animation") {
          window.cancelAnimationFrame(frame.id);
        } else {
          globalThis.clearTimeout(frame.id);
        }
      }
    };
  }, [endPan, navigationDisabled, scheduleCamera, viewportRef]);

  useEffect(() => {
    if (fitViewport || navigationDisabled) return;
    const element = viewportRef.current;
    if (!element) return;
    const size = viewportSize(element);
    if (!size) return;
    if (notes.length > 0 && !hasFitRef.current) {
      const bounds = notesBounds(notes);
      if (bounds) {
        const next = fitCanvasCamera(
          bounds,
          size,
          undefined,
          getFitInsetsRef.current?.(element),
        );
        if (next) {
          setCameraImmediately(next);
          hasFitRef.current = true;
        }
      }
    } else if (notes.length === 0 && !hasDefaultedRef.current) {
      setCameraImmediately(getDefaultCanvasCamera(size));
      hasDefaultedRef.current = true;
    }
  }, [
    fitViewport,
    navigationDisabled,
    notes,
    setCameraImmediately,
    viewportRef,
  ]);

  const gridStyle = useMemo(() => {
    const step = getCanvasGridStep(camera.zoom);
    const screenStep = step * camera.zoom;
    const positionX = ((camera.x % screenStep) + screenStep) % screenStep;
    const positionY = ((camera.y % screenStep) + screenStep) % screenStep;
    const dotOffset = 1;
    return {
      backgroundImage:
        "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--foreground) 30%, transparent) 1px, transparent 1.5px)",
      backgroundPosition: `${positionX - dotOffset}px ${positionY - dotOffset}px`,
      backgroundSize: `${screenStep}px ${screenStep}px`,
    };
  }, [camera]);

  return {
    camera,
    cameraRef,
    preserveCamera: () => {
      hasFitRef.current = true;
    },
    isPanning,
    gridStyle,
    worldPointFromClient,
    fitToNotes,
    zoomTo,
    zoomIn: () => zoomTo(clampCanvasZoom(cameraRef.current.zoom * 1.25)),
    zoomOut: () => zoomTo(clampCanvasZoom(cameraRef.current.zoom / 1.25)),
    resetZoom: () => zoomTo(1),
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel: handlePointerEnd,
    handleWheel,
    setInteractionTool: (tool: "select" | "hand") => {
      toolRef.current = tool;
    },
    setGestureBlocked: (blocked: boolean) => {
      gestureBlockedRef.current = blocked;
    },
    hasPan: () => panRef.current !== null,
    cancelPan: endPan,
    consumePanClick: () => {
      const suppressed = suppressClickRef.current;
      suppressClickRef.current = false;
      return suppressed;
    },
  };
}
