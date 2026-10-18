import {
  getIdeaMapDimensions,
  getNoteHeight,
  IDEA_MAP_BASE_DIMENSIONS,
  IDEA_VALUE_FEASIBILITY_MAP_RANGE,
  NOTE_HEIGHT,
  NOTE_WIDTH,
} from "@/contracts/board";
import type { RoomPhase } from "@/contracts/phase";

export { IDEA_VALUE_FEASIBILITY_MAP_RANGE } from "@/contracts/board";

export const IDEA_VALUE_FEASIBILITY_MAP_WIDTH = 1600;
export const IDEA_VALUE_FEASIBILITY_MAP_HEIGHT = 900;
// 平面外の軸欄64px、grid gap12px、平面border両端2px。
export const IDEA_MAP_AXIS_SIZE = 64;
export const IDEA_MAP_GRID_GAP = 12;
const IDEA_MAP_PLANE_INSET = IDEA_MAP_AXIS_SIZE + IDEA_MAP_GRID_GAP + 2;
export const FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT = 220;
const AXIS_LABEL_BASE_FONT_SIZE = 48;
const AXIS_LABEL_MIN_FONT_SIZE = 42;
const AXIS_LABEL_MAX_FONT_SIZE = 87;

export function isFixedIdeaMapStep(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.phase === 3 && phase.step >= 2;
}

export function getIdeaValueFeasibilityMapDimensions(level: number): {
  width: number;
  height: number;
} {
  return getIdeaMapDimensions(level);
}

export function getIdeaMapAxisLabelFontSize(sizeLevel: number): number {
  const dimensions = getIdeaValueFeasibilityMapDimensions(sizeLevel);
  const mapScale = dimensions.width / IDEA_MAP_BASE_DIMENSIONS.width;
  return Math.round(
    Math.min(
      AXIS_LABEL_MAX_FONT_SIZE,
      Math.max(AXIS_LABEL_MIN_FONT_SIZE, AXIS_LABEL_BASE_FONT_SIZE * mapScale),
    ),
  );
}

/**
 * 固定マップ内の付箋表示倍率。付箋ごとの表示中心を保ったまま大きさを変える。
 */
export function getIdeaMapDisplayScale(sizeLevel: number): number {
  return IDEA_MAP_BASE_DIMENSIONS.width / getIdeaMapDimensions(sizeLevel).width;
}

export type IdeaMapNoteDisplayMetrics = {
  height: number;
  noteHeight: number;
  scale: number;
  width: number;
};

export function getIdeaMapNoteDisplayMetrics(
  note: { content: string; fontSize: number },
  sizeLevel: number,
  responsiveScale = 1,
): IdeaMapNoteDisplayMetrics {
  const safeResponsiveScale =
    Number.isFinite(responsiveScale) && responsiveScale > 0
      ? responsiveScale
      : 1;
  const noteHeight = Math.min(
    FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT,
    getNoteHeight(note.content, note.fontSize),
  );
  const scale = getIdeaMapDisplayScale(sizeLevel);
  const visibleScale = scale * safeResponsiveScale;
  return {
    height: noteHeight * visibleScale,
    noteHeight,
    scale,
    width: NOTE_WIDTH * visibleScale,
  };
}

// アイデアを価値と実現のしやすさで位置付ける2軸マップの固定表示内容。
// 文言をコンポーネントから分離し、ガイドやラベルの変更箇所を一つに保つ。
export const IDEA_VALUE_FEASIBILITY_MAP_LABELS = {
  ariaLabel: "価値と実現のしやすさの2軸マップ",
  title: "解決策の位置付け",
  value: "価値",
  feasibility: "実現のしやすさ",
  low: "低",
  high: "高",
  valueScaleAriaLabel: "価値: 低から高",
  feasibilityScaleAriaLabel: "実現のしやすさ: 低から高",
} as const;

export const IDEA_MAP_SIZE_HELP = {
  scope:
    "表示範囲は全員に反映されますが、付箋の配置位置と評価値は変わりません。",
  camera:
    "個人用ズームは表示範囲と独立しており、自分だけの見え方を調整します。",
  direction:
    "＋で表示範囲を広げると付箋は小さく、－で狭めると大きく見えます。付箋の中心位置は変わりません。上ほど価値が高く、右ほど実現しやすいアイデアです。",
} as const;

export type IdeaValueFeasibilityPoint = {
  value: number;
  feasibility: number;
};

export type IdeaValueFeasibilityMapPosition = {
  bottom: string;
  left: string;
};

export type IdeaValueFeasibilityMapBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FixedIdeaMapNoteSize = {
  width: number;
  height: number;
};

export type FixedIdeaMapNoteGrabOffset = {
  x: number;
  y: number;
};

export type FixedIdeaMapNotePositionScale = {
  displayScale?: number;
  responsiveScale?: number;
  transformOriginX?: number;
  transformOriginY?: number;
};

export type FixedIdeaMapNotePositionProfiles = {
  compact: IdeaValueFeasibilityMapPosition;
  desktop: IdeaValueFeasibilityMapPosition;
  tablet: IdeaValueFeasibilityMapPosition;
};

export function clampIdeaValueFeasibilityMapCoordinate(
  coordinate: number,
): number {
  if (!Number.isFinite(coordinate)) return IDEA_VALUE_FEASIBILITY_MAP_RANGE.min;
  return Math.min(
    IDEA_VALUE_FEASIBILITY_MAP_RANGE.max,
    Math.max(IDEA_VALUE_FEASIBILITY_MAP_RANGE.min, coordinate),
  );
}

// 将来マップ内の子要素を absolute 配置するときに使う変換。
// 左下を (0, 0)、右上を (100, 100) とし、カテゴリには分割しない。
export function getIdeaValueFeasibilityMapPosition({
  value,
  feasibility,
}: IdeaValueFeasibilityPoint): IdeaValueFeasibilityMapPosition {
  return {
    bottom: `${clampIdeaValueFeasibilityMapCoordinate(value)}%`,
    left: `${clampIdeaValueFeasibilityMapCoordinate(feasibility)}%`,
  };
}

/**
 * 付箋をワールド座標へ配置する。拡縮は親のカメラ変換へまとめる。
 */
export type IdeaMapNoteGeometry = {
  width: number;
  height: number;
  maxNoteHeight: number;
  noteHeightLimit: number;
};
export function getIdeaMapNoteGeometry(
  level: number,
  heights: readonly number[],
): IdeaMapNoteGeometry {
  const dimensions = getIdeaMapDimensions(level);
  const width = dimensions.width - IDEA_MAP_PLANE_INSET;
  const height = dimensions.height - IDEA_MAP_PLANE_INSET;
  // 長文1枚で他の付箋を操作不能にしない。本文を保持し表示のみ75%までにする。
  const noteHeightLimit = height * 0.75;
  return {
    width,
    height,
    noteHeightLimit,
    maxNoteHeight: Math.min(noteHeightLimit, Math.max(NOTE_HEIGHT, ...heights)),
  };
}
export function getIdeaValueFeasibilityMapNotePosition(
  point: IdeaValueFeasibilityPoint,
  noteHeight = NOTE_HEIGHT,
  geometry: IdeaMapNoteGeometry = getIdeaMapNoteGeometry(0, [noteHeight]),
): IdeaValueFeasibilityMapPosition {
  const feasibility = clampIdeaValueFeasibilityMapCoordinate(point.feasibility);
  const value = clampIdeaValueFeasibilityMapCoordinate(point.value);
  // 全noteの中心を同じ線形有効域へ置く。端で1枚だけclampの傾きが変わらない。
  const width = Math.max(0, geometry.width - NOTE_WIDTH);
  const height = Math.max(0, geometry.height - geometry.maxNoteHeight);
  return {
    left: `${(feasibility * width) / 100}px`,
    bottom: `${(value * height) / 100 + (geometry.maxNoteHeight - Math.min(noteHeight, geometry.noteHeightLimit)) / 2}px`,
  };
}

/**
 * 固定マップ上で、付箋の左下を0〜100の移動領域へ対応させる。
 * マップ自体はレスポンシブでも、付箋サイズはカメラ倍率に影響されない。
 */
export function getFixedIdeaMapNotePosition(
  point: IdeaValueFeasibilityPoint,
  noteHeight: number,
  {
    displayScale = 1,
    responsiveScale = 1,
    transformOriginX = 0.5,
    transformOriginY = 0.5,
  }: FixedIdeaMapNotePositionScale = {},
): IdeaValueFeasibilityMapPosition {
  const feasibility = clampIdeaValueFeasibilityMapCoordinate(point.feasibility);
  const value = clampIdeaValueFeasibilityMapCoordinate(point.value);
  const safeDisplayScale =
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const safeResponsiveScale =
    Number.isFinite(responsiveScale) && responsiveScale > 0
      ? responsiveScale
      : 1;
  const safeTransformOriginX = clampScaleFraction(transformOriginX, 0.5);
  const safeTransformOriginY = clampScaleFraction(transformOriginY, 0.5);
  const displayedHeight = Math.min(
    FIXED_IDEA_MAP_NOTE_HEIGHT_LIMIT,
    Math.max(0, noteHeight),
  );
  const referenceWidth = NOTE_WIDTH * safeResponsiveScale;
  const referenceHeight = displayedHeight * safeResponsiveScale;
  // position値は倍率1のときの付箋中心を表し、表示倍率を変えてもその中心を維持する。
  const leftOffset =
    (feasibility * referenceWidth) / 100 -
    (referenceWidth * (1 - safeDisplayScale)) / 2 +
    NOTE_WIDTH * safeTransformOriginX * (1 - safeDisplayScale);
  const bottomOffset =
    (value * referenceHeight) / 100 -
    (referenceHeight * (1 - safeDisplayScale)) / 2 +
    displayedHeight * (1 - safeTransformOriginY) * (1 - safeDisplayScale);
  return {
    left: getPercentWithPixelOffset(feasibility, leftOffset),
    bottom: getPercentWithPixelOffset(value, bottomOffset),
  };
}

export function getFixedIdeaMapNotePositionProfiles(
  point: IdeaValueFeasibilityPoint,
  noteHeight: number,
  displayScale: number,
): FixedIdeaMapNotePositionProfiles {
  return {
    compact: getFixedIdeaMapNotePosition(point, noteHeight, {
      displayScale,
      responsiveScale: 0.6,
      transformOriginX: 0.3,
      transformOriginY: 0.7,
    }),
    tablet: getFixedIdeaMapNotePosition(point, noteHeight, {
      displayScale,
      responsiveScale: 0.75,
      transformOriginX: 0.375,
      transformOriginY: 0.625,
    }),
    desktop: getFixedIdeaMapNotePosition(point, noteHeight, {
      displayScale,
      responsiveScale: 1,
      transformOriginX: 0.5,
      transformOriginY: 0.5,
    }),
  };
}

/**
 * レンダリング済みの付箋寸法とつかみ位置を使い、付箋全体がマップ内に収まる座標を返す。
 */
export function getFixedIdeaMapNotePointFromClientPosition(
  clientX: number,
  clientY: number,
  bounds: IdeaValueFeasibilityMapBounds,
  noteSize: FixedIdeaMapNoteSize,
  grabOffset: FixedIdeaMapNoteGrabOffset,
  coordinateSize: FixedIdeaMapNoteSize = noteSize,
): IdeaValueFeasibilityPoint | null {
  const mapWidth = bounds.right - bounds.left;
  const mapHeight = bounds.bottom - bounds.top;
  const horizontalTravel = mapWidth - coordinateSize.width;
  const verticalTravel = mapHeight - coordinateSize.height;
  if (
    horizontalTravel <= 0 ||
    verticalTravel <= 0 ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(noteSize.width) ||
    !Number.isFinite(noteSize.height) ||
    !Number.isFinite(coordinateSize.width) ||
    !Number.isFinite(coordinateSize.height)
  ) {
    return null;
  }

  const left = Math.min(
    bounds.right - noteSize.width,
    Math.max(bounds.left, clientX - grabOffset.x),
  );
  const top = Math.min(
    bounds.bottom - noteSize.height,
    Math.max(bounds.top, clientY - grabOffset.y),
  );

  return {
    feasibility: clampIdeaValueFeasibilityMapCoordinate(
      ((left + noteSize.width / 2 - coordinateSize.width / 2 - bounds.left) /
        horizontalTravel) *
        100,
    ),
    value: clampIdeaValueFeasibilityMapCoordinate(
      ((bounds.bottom - top - noteSize.height / 2 - coordinateSize.height / 2) /
        verticalTravel) *
        100,
    ),
  };
}

function clampScaleFraction(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function getPercentWithPixelOffset(percent: number, offset: number): string {
  if (offset === 0) return `${percent}%`;
  return `calc(${percent}% ${offset > 0 ? "-" : "+"} ${Math.abs(offset)}px)`;
}
export function getIdeaMapNotePointFromClientPosition(
  clientX: number,
  clientY: number,
  bounds: IdeaValueFeasibilityMapBounds,
  geometry: IdeaMapNoteGeometry,
): IdeaValueFeasibilityPoint | null {
  const scaleX = (bounds.right - bounds.left) / geometry.width;
  const scaleY = (bounds.bottom - bounds.top) / geometry.height;
  const width = (geometry.width - NOTE_WIDTH) * scaleX;
  const height = (geometry.height - geometry.maxNoteHeight) * scaleY;
  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return null;
  return {
    feasibility:
      ((clientX - bounds.left - (NOTE_WIDTH * scaleX) / 2) * 100) / width,
    value:
      ((bounds.bottom - clientY - (geometry.maxNoteHeight * scaleY) / 2) *
        100) /
      height,
  };
}

// マップ平面のクライアント座標を、永続化・配信に使う連続座標へ変換する。
// x は実現のしやすさ（左=0、右=100）、y は価値（下=0、上=100）として反転する。
export function getIdeaValueFeasibilityMapPointFromClientPosition(
  clientX: number,
  clientY: number,
  bounds: IdeaValueFeasibilityMapBounds,
  clamp = true,
): IdeaValueFeasibilityPoint | null {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width <= 0 || height <= 0) return null;

  const feasibility = ((clientX - bounds.left) / width) * 100;
  const value = ((bounds.bottom - clientY) / height) * 100;
  return {
    feasibility: clamp
      ? clampIdeaValueFeasibilityMapCoordinate(feasibility)
      : feasibility,
    value: clamp ? clampIdeaValueFeasibilityMapCoordinate(value) : value,
  };
}
