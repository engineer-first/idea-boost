export type TimerRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type TimerPosition = { right: number; top: number };

export function placeRoomTimer(
  position: TimerPosition,
  width: number,
  bounds: TimerRect,
  obstacles: readonly TimerRect[],
): TimerPosition {
  const gap = 12;
  const height = 72;
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

/**
 * ドロップした位置から、作業領域の最寄りの辺へ寄せる。
 * HUD やサイドバーに重なる所は、同じ辺に沿ってずらして避ける。
 * どの辺にも空きが無いときだけ、離した位置の近くの空きへ収める。
 */
export function snapRoomTimer(
  position: TimerPosition,
  width: number,
  bounds: TimerRect,
  obstacles: readonly TimerRect[],
): TimerPosition {
  const gap = 12;
  const height = 72;
  const minRight = bounds.left + width + gap;
  const maxRight = bounds.right - gap;
  const minTop = bounds.top + gap;
  const maxTop = bounds.bottom - height - gap;
  const within = (value: number, min: number, max: number): boolean =>
    value >= min && value <= max;
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));
  const overlaps = (p: TimerPosition, r: TimerRect): boolean =>
    p.right > r.left - gap &&
    p.right - width < r.right + gap &&
    p.top < r.bottom + gap &&
    p.top + height > r.top - gap;
  // 左右の辺は高さを、上下の辺は横位置を、障害物の手前・先までずらした候補を作る
  const tops = [
    clamp(position.top, minTop, maxTop),
    ...obstacles.flatMap((r) => [r.top - height - gap, r.bottom + gap]),
  ].filter((top) => within(top, minTop, maxTop));
  const rights = [
    clamp(position.right, minRight, maxRight),
    ...obstacles.flatMap((r) => [r.left - gap, r.right + width + gap]),
  ].filter((right) => within(right, minRight, maxRight));
  const candidates: TimerPosition[] = [
    ...tops.flatMap((top) => [
      { right: minRight, top },
      { right: maxRight, top },
    ]),
    ...rights.flatMap((right) => [
      { right, top: minTop },
      { right, top: maxTop },
    ]),
  ].filter((p) => obstacles.every((r) => !overlaps(p, r)));
  const distance = (p: TimerPosition): number =>
    Math.hypot(p.right - position.right, p.top - position.top);
  if (candidates.length === 0)
    return placeRoomTimer(position, width, bounds, obstacles);
  return candidates.reduce((nearest, p) =>
    distance(p) < distance(nearest) ? p : nearest,
  );
}
