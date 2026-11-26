export type TimerRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type TimerPosition = { right: number; top: number };
export type TimerEdge = "left" | "right" | "top" | "bottom";

/** 作業領域の端・障害物との間に空ける余白 */
const GAP = 12;
/** タイマーの高さ。展開しても CSS の .floating は 72px のまま */
const HEIGHT = 72;

export function placeRoomTimer(
  position: TimerPosition,
  width: number,
  bounds: TimerRect,
  obstacles: readonly TimerRect[],
): TimerPosition {
  const gap = GAP;
  const height = HEIGHT;
  const clamp = (p: TimerPosition): TimerPosition => ({
    right: Math.max(
      bounds.left + width + gap,
      Math.min(bounds.right - gap, p.right),
    ),
    top: Math.max(
      bounds.top + gap,
      Math.min(bounds.bottom - height - gap, p.top),
    ),
  });
  const overlaps = (p: TimerPosition, r: TimerRect): boolean =>
    p.right > r.left - gap &&
    p.right - width < r.right + gap &&
    p.top < r.bottom + gap &&
    p.top + height > r.top - gap;
  const origin = clamp(position);
  const candidates: TimerPosition[] = [origin];
  for (const r of obstacles) {
    candidates.push(
      clamp({ right: r.left - gap, top: origin.top }),
      clamp({ right: r.right + width + gap, top: origin.top }),
      clamp({ right: origin.right, top: r.top - height - gap }),
      clamp({ right: origin.right, top: r.bottom + gap }),
    );
  }
  const rights = [...new Set(candidates.map((p) => p.right))];
  const tops = [...new Set(candidates.map((p) => p.top))];
  for (const right of rights)
    for (const top of tops) candidates.push({ right, top });
  return (
    candidates
      .filter((p) => obstacles.every((r) => !overlaps(p, r)))
      .sort(
        (a, b) =>
          Math.hypot(a.right - origin.right, a.top - origin.top) -
          Math.hypot(b.right - origin.right, b.top - origin.top),
      )[0] ?? origin
  );
}

function edgeRange(width: number, bounds: TimerRect) {
  return {
    minRight: bounds.left + width + GAP,
    maxRight: bounds.right - GAP,
    minTop: bounds.top + GAP,
    maxTop: bounds.bottom - HEIGHT - GAP,
  };
}

/** タイマーが作業領域のどの辺に接しているか。内側に浮いていれば null */
export function timerEdge(
  position: TimerPosition,
  width: number,
  bounds: TimerRect,
): TimerEdge | null {
  const { minRight, maxRight, minTop, maxTop } = edgeRange(width, bounds);
  if (position.right === maxRight) return "right";
  if (position.right === minRight) return "left";
  if (position.top === minTop) return "top";
  if (position.top === maxTop) return "bottom";
  return null;
}

/**
 * ドロップした位置から、作業領域の最寄りの辺へ寄せる。
 * HUD やサイドバーに重なる所は、同じ辺に沿ってずらして避ける。
 * edge を渡すと、その辺に空きがある限りその辺に付け直す（画面サイズの変更・案内の出現後）。
 * どの辺にも空きが無いときだけ、離した位置の近くの空きへ収める。
 */
export function snapRoomTimer(
  position: TimerPosition,
  width: number,
  bounds: TimerRect,
  obstacles: readonly TimerRect[],
  edge?: TimerEdge,
): TimerPosition {
  const { minRight, maxRight, minTop, maxTop } = edgeRange(width, bounds);
  const within = (value: number, min: number, max: number): boolean =>
    value >= min && value <= max;
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));
  const overlaps = (p: TimerPosition, r: TimerRect): boolean =>
    p.right > r.left - GAP &&
    p.right - width < r.right + GAP &&
    p.top < r.bottom + GAP &&
    p.top + HEIGHT > r.top - GAP;
  const origin: TimerPosition = {
    right:
      edge === "right" ? maxRight : edge === "left" ? minRight : position.right,
    top: edge === "top" ? minTop : edge === "bottom" ? maxTop : position.top,
  };
  // 左右の辺は高さを、上下の辺は横位置を、障害物の手前・先までずらした候補を作る
  const tops = [
    clamp(origin.top, minTop, maxTop),
    ...obstacles.flatMap((r) => [r.top - HEIGHT - GAP, r.bottom + GAP]),
  ].filter((top) => within(top, minTop, maxTop));
  const rights = [
    clamp(origin.right, minRight, maxRight),
    ...obstacles.flatMap((r) => [r.left - GAP, r.right + width + GAP]),
  ].filter((right) => within(right, minRight, maxRight));
  const candidates: (TimerPosition & { edge: TimerEdge })[] = [
    ...tops.flatMap((top) => [
      { right: minRight, top, edge: "left" as const },
      { right: maxRight, top, edge: "right" as const },
    ]),
    ...rights.flatMap((right) => [
      { right, top: minTop, edge: "top" as const },
      { right, top: maxTop, edge: "bottom" as const },
    ]),
  ].filter((p) => obstacles.every((r) => !overlaps(p, r)));
  const sameEdge = candidates.filter((p) => p.edge === edge);
  const pool = sameEdge.length > 0 ? sameEdge : candidates;
  if (pool.length === 0)
    return placeRoomTimer(position, width, bounds, obstacles);
  const distance = (p: TimerPosition): number =>
    Math.hypot(p.right - origin.right, p.top - origin.top);
  const nearest = pool.reduce((best, p) =>
    distance(p) < distance(best) ? p : best,
  );
  return { right: nearest.right, top: nearest.top };
}
