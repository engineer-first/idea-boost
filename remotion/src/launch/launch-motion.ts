import { spring } from "motion";

export function snap(frame: number, start = 0, duration = 0.7): number {
  if (frame <= start) return 0;
  if (frame >= start + duration * 60 + 60) return 1;
  return spring({
    keyframes: [0, 1],
    duration: duration * 1000,
    bounce: 0.16,
  }).next(((frame - start) / 60) * 1000).value;
}

export function ramp(frame: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
