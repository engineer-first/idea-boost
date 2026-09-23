// キャンバスの世界座標に設ける安全上限。UI上は無限に見える範囲だが、
// 異常な入力でCSS transformやD1/DOの値が壊れないよう、境界で共有する。
export const CANVAS_COORDINATE_LIMIT = 1_000_000;

// アイデアフェーズの2軸マップで使う連続座標。横軸は実現可能性、縦軸は価値を
// 表し、どちらも低=0・高=100 として保存・同期する。
export const IDEA_VALUE_FEASIBILITY_MAP_RANGE = { min: 0, max: 100 } as const;

// 2軸マップは付箋サイズを変えず、段階ごとに縦横を10%ずつ広げる。
// 初期段階はフェーズ3の個人付箋総数から選び、個別の内容や作者別の枚数は使わない。
export const IDEA_MAP_BASE_DIMENSIONS = { width: 1600, height: 900 } as const;
export const IDEA_MAP_SIZE_LEVEL_RANGE = { min: 0, max: 15 } as const;
export const IDEA_MAP_SIZE_GROWTH = 1.1;
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
export const NOTE_DEFAULT_FONT_SIZE = 14;
export const NOTE_FONT_SIZE_RANGE = { min: 12, max: 24, step: 1 } as const;

// 本文は左右 8px を基準にしつつ、右側の付箋操作へ 40px を予約する。
// 基本高を超えたときは、下側の票・決定表示や除外表示の余白も追加する。
// ブラウザのフォント計測値を共有状態へ混ぜず、
// 全クライアント・グループ判定・カメラが同じ高さを再現できるよう、1文字を
// fontSize px とみなす保守的な折り返しで必要高を決める。
const NOTE_TEXT_HORIZONTAL_SPACE = 48;
const NOTE_TEXT_VERTICAL_SPACE = 56;
const NOTE_OVERFLOW_CHROME_SPACE = 80;
const NOTE_TEXT_LINE_HEIGHT_RATIO = 1.5;

export function getNoteHeight(content: string, fontSize: number): number {
  const safeFontSize = Number.isFinite(fontSize)
    ? Math.min(
        NOTE_FONT_SIZE_RANGE.max,
        Math.max(NOTE_FONT_SIZE_RANGE.min, Math.trunc(fontSize)),
      )
    : NOTE_DEFAULT_FONT_SIZE;
  const charactersPerLine = Math.max(
    1,
    Math.floor((NOTE_WIDTH - NOTE_TEXT_HORIZONTAL_SPACE) / safeFontSize),
  );
  const visualLineCount = content.split("\n").reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charactersPerLine));
  }, 0);
  const lineHeight = Math.ceil(safeFontSize * NOTE_TEXT_LINE_HEIGHT_RATIO);
  const contentHeight = visualLineCount * lineHeight + NOTE_TEXT_VERTICAL_SPACE;
  return contentHeight <= NOTE_HEIGHT
    ? NOTE_HEIGHT
    : contentHeight + NOTE_OVERFLOW_CHROME_SPACE;
}

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
