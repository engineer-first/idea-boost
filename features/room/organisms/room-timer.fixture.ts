import type { TimerState } from "@/contracts/room-protocol";

export const ROOM_TIMER_FIXTURE_NOW = Date.parse("2026-07-12T10:00:00.000Z");
export const ROOM_TIMER_IDLE_MIN_DURATION_MS = 0;
export const ROOM_TIMER_IDLE_MAX_ADJUST_DURATION_MS = 99 * 60_000;

export function buildRunningTimer(
  options: { now?: number; remainingMs?: number; durationMs?: number } = {},
): TimerState {
  const now = options.now ?? ROOM_TIMER_FIXTURE_NOW;
  const remainingMs = options.remainingMs ?? 5 * 60_000;
  return {
    status: "running",
    endsAt: now + remainingMs,
    durationMs: options.durationMs ?? remainingMs,
  };
}

export function buildPausedTimer(
  options: { remainingMs?: number; durationMs?: number } = {},
): TimerState {
  return {
    status: "paused",
    remainingMs: options.remainingMs ?? 2 * 60_000 + 30_000,
    durationMs: options.durationMs ?? 5 * 60_000,
  };
}

export function buildEndedTimer(
  options: { durationMs?: number } = {},
): TimerState {
  return {
    status: "ended",
    durationMs: options.durationMs ?? 60_000,
  };
}
