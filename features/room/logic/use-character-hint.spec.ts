import { act, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimerState } from "@/contracts/room-protocol";
import { useCharacterHint } from "./use-character-hint";

afterEach(() => vi.useRealTimers());
const phase = { kind: "step", phase: 1, step: 1 } as const;
const running: TimerState = {
  status: "running",
  endsAt: 180_000,
  durationMs: 180_000,
};

describe("キャラクターの一言", () => {
  it("個人作業で30秒書いていないと案内し、8秒後に消えて再表示できる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: running,
        serverOffsetMs: 0,
        noteCount: 0,
      }),
    );
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.message).toContain("1枚");
    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.message).toBeNull();
    act(() => result.current.replay());
    expect(result.current.message).toContain("1枚");
  });
  it("残り30秒と時間切れを優先し、同じ案内を繰り返さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(149_000);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: running,
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.message).toContain("残り30秒");
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.message).toContain("時間");
  });
  it("停止中・ロビー・切断中は自動案内せず、工程変更で過去の案内を消す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(160_000);
    const { result, rerender } = renderHook(
      ({ active, step }) =>
        useCharacterHint({
          phase: step ? phase : { kind: "lobby" },
          timer: running,
          serverOffsetMs: 0,
          noteCount: 0,
          active,
        }),
      { initialProps: { active: true, step: true } },
    );
    expect(result.current.message).not.toBeNull();
    rerender({ active: false, step: true });
    expect(result.current.message).toBeNull();
    rerender({ active: true, step: false });
    act(() => result.current.replay());
    expect(result.current.message).toBeNull();
  });
  it.each([
    { status: "idle" },
    { status: "paused", remainingMs: 10_000, durationMs: 180_000 },
  ] satisfies TimerState[])("$status の間は0枚でも一言を出さない", (timer) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 0 }),
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.message).toBeNull();
  });

  it("共有工程では0枚の案内を出さず、サーバー時刻の残り時間で案内する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase: { ...phase, step: 2 },
        timer: running,
        serverOffsetMs: 100_000,
        noteCount: 0,
      }),
    );
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.message).toContain("残り30秒");
  });
  it("StrictModeでも最初の一言が8秒で消える", () => {
    vi.useFakeTimers();
    vi.setSystemTime(160_000);
    const { result } = renderHook(
      () =>
        useCharacterHint({
          phase,
          timer: running,
          serverOffsetMs: 0,
          noteCount: 1,
        }),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    );
    expect(result.current.message).not.toBeNull();
    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.message).toBeNull();
  });
});
