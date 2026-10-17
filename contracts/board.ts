// キャンバスの世界座標に設ける安全上限。UI上は無限に見える範囲だが、
// 異常な入力でCSS transformやD1/DOの値が壊れないよう、境界で共有する。
export const CANVAS_COORDINATE_LIMIT = 1_000_000;

// アイデアフェーズの2軸マップで使う連続座標。横軸は実現のしやすさ、縦軸は価値を
// 表し、どちらも低=0・高=100 として保存・同期する。
export const IDEA_VALUE_FEASIBILITY_MAP_RANGE = { min: 0, max: 100 } as const;

// 2軸マップの共有表示範囲。段階ごとに論理範囲を縦横10%ずつ広げる。
// 固定マップでは逆倍率を付箋レイヤーに適用し、外枠・座標・評価値を保ったまま表示する。
// 初期段階は共有付箋総数から算出した基準に4段階分の余裕を加え、個別内容や作者別枚数は使わない。
export const IDEA_MAP_BASE_DIMENSIONS = { width: 1600, height: 900 } as const;
export const IDEA_MAP_SIZE_LEVEL_RANGE = { min: 0, max: 15 } as const;
export const IDEA_MAP_SIZE_GROWTH = 1.1;
export const IDEA_MAP_BASE_NOTE_CAPACITY = 12;
export const IDEA_MAP_DEFAULT_EXTRA_SIZE_LEVELS = 4;

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

export function getInitialIdeaMapSizeLevel(sharedNoteCount: number): number {
  const capacityLevel =
    Number.isFinite(sharedNoteCount) &&
    sharedNoteCount > IDEA_MAP_BASE_NOTE_CAPACITY
      ? Math.ceil(
          Math.log(sharedNoteCount / IDEA_MAP_BASE_NOTE_CAPACITY) /
            Math.log(IDEA_MAP_SIZE_GROWTH ** 2),
        )
      : IDEA_MAP_SIZE_LEVEL_RANGE.min;
  return Math.min(
    IDEA_MAP_SIZE_LEVEL_RANGE.max,
    capacityLevel + IDEA_MAP_DEFAULT_EXTRA_SIZE_LEVELS,
  );
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

// 本文は左右 8px の余白を設ける。
// 下側は本文余白と票・決定表示の領域を合わせて 48px 予約する。
// ブラウザのフォント計測値を共有状態へ混ぜず、
// 全クライアント・グループ判定・カメラが同じ高さを再現できるよう、1文字を
// fontSize px とみなす保守的な折り返しで必要高を決める。
const NOTE_TEXT_HORIZONTAL_SPACE = 16;
const NOTE_TEXT_VERTICAL_SPACE = 56;
const NOTE_TEXT_LINE_HEIGHT_RATIO = 1.5;

function countNoteTextLines(line: string, charactersPerLine: number): number {
  if (line.length === 0) return 1;
  let count = 0;
  let start = 0;
  while (start < line.length) {
    let end = Math.min(line.length, start + charactersPerLine);
    if (end < line.length) {
      // 句読点・閉じ括弧の行頭と、開き括弧の行末を避ける。
      // フォントによって句読点が詰まらない場合も、必要な行数を確保する。
      while (
        end > start + 1 &&
        (/[\p{Pe}\p{Pf}、。，．！？：；]/u.test(line[end]) ||
          /[\p{Ps}\p{Pi}]/u.test(line[end - 1]))
      ) {
        end--;
      }
    }
    start = end;
    count++;
  }
  return count;
}

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
    return count + countNoteTextLines(line, charactersPerLine);
  }, 0);
  const lineHeight = Math.ceil(safeFontSize * NOTE_TEXT_LINE_HEIGHT_RATIO);
  const contentHeight = visualLineCount * lineHeight + NOTE_TEXT_VERTICAL_SPACE;
  return Math.max(NOTE_HEIGHT, contentHeight);
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
