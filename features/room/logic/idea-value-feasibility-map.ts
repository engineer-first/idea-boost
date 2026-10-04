import {
  getIdeaMapDimensions,
  IDEA_VALUE_FEASIBILITY_MAP_RANGE,
  NOTE_HEIGHT,
  NOTE_WIDTH,
} from "@/contracts/board";

export { IDEA_VALUE_FEASIBILITY_MAP_RANGE } from "@/contracts/board";

export const IDEA_VALUE_FEASIBILITY_MAP_WIDTH = 1600;
export const IDEA_VALUE_FEASIBILITY_MAP_HEIGHT = 900;
// 平面外の軸欄64px、grid gap12px、平面border両端2px。
export const IDEA_MAP_AXIS_SIZE = 64;
export const IDEA_MAP_GRID_GAP = 12;
const IDEA_MAP_PLANE_INSET = IDEA_MAP_AXIS_SIZE + IDEA_MAP_GRID_GAP + 2;

export function getIdeaValueFeasibilityMapDimensions(level: number): {
  width: number;
  height: number;
} {
  return getIdeaMapDimensions(level);
}

// アイデアを価値と実現可能性で位置付ける2軸マップの固定表示内容。
// 文言をコンポーネントから分離し、ガイドやラベルの変更箇所を一つに保つ。
export const IDEA_VALUE_FEASIBILITY_MAP_LABELS = {
  ariaLabel: "価値と実現可能性の2軸マップ",
  title: "解決策の位置付け",
  value: "価値",
  feasibility: "実現可能性",
  low: "低",
  high: "高",
  valueScaleAriaLabel: "価値: 低から高",
  feasibilityScaleAriaLabel: "実現可能性: 低から高",
} as const;

export const IDEA_MAP_SIZE_HELP = {
  scope: "マップの広さと付箋の位置は全員に反映されます。",
  camera: "表示倍率は自分だけの見え方です。左下の表示操作で調整できます。",
  direction: "上ほど価値が高く、右ほど実現しやすいアイデアです。",
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
// x は実現可能性（左=0、右=100）、y は価値（下=0、上=100）として反転する。
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
