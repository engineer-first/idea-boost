// キャンバスの世界座標に設ける安全上限。UI上は無限に見える範囲だが、
// 異常な入力でCSS transformやD1/DOの値が壊れないよう、境界で共有する。
export const CANVAS_COORDINATE_LIMIT = 1_000_000;

// アイデアフェーズの2軸マップで使う連続座標。横軸は実現可能性、縦軸は価値を
// 表し、どちらも低=0・高=100 として保存・同期する。
export const IDEA_VALUE_FEASIBILITY_MAP_RANGE = { min: 0, max: 100 } as const;

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
