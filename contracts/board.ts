// キャンバスの世界座標に設ける安全上限。UI上は無限に見える範囲だが、
// 異常な入力でCSS transformやD1/DOの値が壊れないよう、境界で共有する。
export const CANVAS_COORDINATE_LIMIT = 1_000_000;

// アイデアフェーズの2軸マップで使う連続座標。横軸は実現可能性、縦軸は価値を
// 表し、どちらも低=0・高=100 として保存・同期する。
export const IDEA_VALUE_FEASIBILITY_MAP_RANGE = { min: 0, max: 100 } as const;

// 2軸マップは付箋サイズを変えず、段階ごとに縦横を20%ずつ広げる。
// 初期段階はフェーズ3の個人付箋総数から選び、個別の内容や作者別の枚数は使わない。
export const IDEA_MAP_BASE_DIMENSIONS = { width: 1600, height: 900 } as const;
export const IDEA_MAP_SIZE_LEVEL_RANGE = { min: 0, max: 8 } as const;
export const IDEA_MAP_SIZE_GROWTH = 1.2;
export const IDEA_MAP_BASE_NOTE_CAPACITY = 12;

export function getIdeaMapDimensions(level: number): {
  width: number;
  height: number;
} {
  const safeLevel = Number.isFinite(level)
    ? Math.min(
        IDEA_MAP_SIZE_LEVEL_RANGE.max,
        Math.max(IDEA_MAP_SIZE_LEVEL_RANGE.min, Math.trunc(level)),
      )
    : IDEA_MAP_SIZE_LEVEL_RANGE.min;
  const scale = IDEA_MAP_SIZE_GROWTH ** safeLevel;
  return {
    width: Math.round(IDEA_MAP_BASE_DIMENSIONS.width * scale),
    height: Math.round(IDEA_MAP_BASE_DIMENSIONS.height * scale),
  };
}

export function getInitialIdeaMapSizeLevel(privateNoteCount: number): number {
  if (
    !Number.isFinite(privateNoteCount) ||
    privateNoteCount <= IDEA_MAP_BASE_NOTE_CAPACITY
  ) {
    return IDEA_MAP_SIZE_LEVEL_RANGE.min;
  }
  const notesPerLevel = IDEA_MAP_SIZE_GROWTH ** 2;
  const level = Math.ceil(
    Math.log(privateNoteCount / IDEA_MAP_BASE_NOTE_CAPACITY) /
      Math.log(notesPerLevel),
  );
  return Math.min(IDEA_MAP_SIZE_LEVEL_RANGE.max, level);
}

export function isIdeaValueFeasibilityMapCoordinate(
  coordinate: number,
): boolean {
  return (
    Number.isFinite(coordinate) &&
    coordinate >= IDEA_VALUE_FEASIBILITY_MAP_RANGE.min &&
    coordinate <= IDEA_VALUE_FEASIBILITY_MAP_RANGE.max
  );
}

export const NOTE_WIDTH = 200;
export const NOTE_HEIGHT = 150;

// 新規付箋の初期配置範囲。ボード中央付近に JITTER 分だけずらして重なりを避ける。
// 配置はサーバー（RoomDO）が決めるため、その検証テストともここで値を共有する。
export const NOTE_SPAWN_X_MIN = 800;
export const NOTE_SPAWN_Y_MIN = 500;
export const NOTE_SPAWN_JITTER = 200;

// ドラッグ中のnote-drag配信を間引く間隔（ミリ秒）。
export const DRAG_BROADCAST_THROTTLE_MS = 80;

// pointerdownからこの距離(px)を超えて動いたらドラッグとみなす閾値。
// クリック（選択・編集開始）とドラッグ（移動）を同じポインター操作から
// 区別するために必要。tldrawのドラッグ判定距離に合わせて4pxにしている。
export const DRAG_THRESHOLD_PX = 4;
