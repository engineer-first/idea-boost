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
