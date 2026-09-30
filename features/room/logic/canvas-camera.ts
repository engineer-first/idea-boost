import {
  CANVAS_COORDINATE_LIMIT,
  NOTE_HEIGHT,
  NOTE_SPAWN_X_MIN,
  NOTE_SPAWN_Y_MIN,
  NOTE_WIDTH,
} from "@/contracts/board";

export const MIN_CANVAS_ZOOM = 0.01;
export const MAX_CANVAS_ZOOM = 4;
export const DEFAULT_CANVAS_ZOOM = 1;
export const CANVAS_GRID_BASE_STEP = 40;
export const CANVAS_FIT_PADDING = 64;

export type CanvasPoint = { x: number; y: number };

export type CanvasCamera = CanvasPoint & {
  zoom: number;
};

export type CanvasBounds = CanvasPoint & {
  width: number;
  height: number;
};

export type CanvasFitInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type CanvasViewport = {
  width: number;
  height: number;
};

export const DEFAULT_CANVAS_CENTER: CanvasPoint = {
  x: NOTE_SPAWN_X_MIN + NOTE_WIDTH / 2,
  y: NOTE_SPAWN_Y_MIN + NOTE_HEIGHT / 2,
};

export function clampCanvasZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_CANVAS_ZOOM), MAX_CANVAS_ZOOM);
}

export function clampCanvasCoordinate(value: number): number {
  return Math.min(
    Math.max(value, -CANVAS_COORDINATE_LIMIT),
    CANVAS_COORDINATE_LIMIT,
  );
}

export function worldToScreen(
  point: CanvasPoint,
  camera: CanvasCamera,
): CanvasPoint {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function screenToWorld(
  point: CanvasPoint,
  camera: CanvasCamera,
): CanvasPoint {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function zoomAtScreenPoint(
  camera: CanvasCamera,
  requestedZoom: number,
  point: CanvasPoint,
): CanvasCamera {
  const zoom = clampCanvasZoom(requestedZoom);
  const worldPoint = screenToWorld(point, camera);
  return {
    x: point.x - worldPoint.x * zoom,
    y: point.y - worldPoint.y * zoom,
    zoom,
  };
}

export function fitCanvasCamera(
  bounds: CanvasBounds,
  viewport: CanvasViewport,
  padding?: number,
): CanvasCamera;
export function fitCanvasCamera(
  bounds: CanvasBounds,
  viewport: CanvasViewport,
  padding: number | undefined,
  insets: CanvasFitInsets | undefined,
): CanvasCamera | null;
export function fitCanvasCamera(
  bounds: CanvasBounds,
  viewport: CanvasViewport,
  padding = CANVAS_FIT_PADDING,
  insets?: CanvasFitInsets,
): CanvasCamera | null {
  const left = insets?.left ?? 0;
  const top = insets?.top ?? 0;
  const safeWidth = viewport.width - left - (insets?.right ?? 0);
  const safeHeight = viewport.height - top - (insets?.bottom ?? 0);
  if (
    insets &&
    (![left, top, safeWidth, safeHeight].every(Number.isFinite) ||
      safeWidth <= padding * 2 ||
      safeHeight <= padding * 2)
  )
    return null;
  const availableWidth = Math.max(safeWidth - padding * 2, 1);
  const availableHeight = Math.max(safeHeight - padding * 2, 1);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const requestedZoom = Math.min(
    availableWidth / width,
    availableHeight / height,
    1,
  );
  if (insets && requestedZoom < MIN_CANVAS_ZOOM) return null;
  const zoom = clampCanvasZoom(requestedZoom);
  return {
    x: left + (safeWidth - width * zoom) / 2 - bounds.x * zoom,
    y: top + (safeHeight - height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

export function getCanvasGridStep(zoom: number): number {
  const exponent = Math.round(
    Math.log2(32 / (CANVAS_GRID_BASE_STEP * Math.max(zoom, MIN_CANVAS_ZOOM))),
  );
  return CANVAS_GRID_BASE_STEP * 2 ** exponent;
}

export function getDefaultCanvasCamera(viewport: CanvasViewport): CanvasCamera {
  return {
    x: viewport.width / 2 - DEFAULT_CANVAS_CENTER.x,
    y: viewport.height / 2 - DEFAULT_CANVAS_CENTER.y,
    zoom: DEFAULT_CANVAS_ZOOM,
  };
}
