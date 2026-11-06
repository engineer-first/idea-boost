import { act, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOM_PHASE_STEP_LABELS, type RoomPhase } from "@/contracts/phase";
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
  it.each(
    Object.entries(ROOM_PHASE_STEP_LABELS).flatMap(([phase, steps]) =>
      Object.keys(steps).map(
        (step) =>
          ({
            kind: "step" as const,
            phase: Number(phase),
            step: Number(step),
          }) as RoomPhase,
      ),
    ),
  )("工程 $phase-$step で開始案内と2つのコツを出す", (phase) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: { ...running, endsAt: 900_000 },
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    const messages = [result.current.message];
    for (let index = 0; index < 2; index += 1) {
      act(() => vi.advanceTimersByTime(60_000));
      messages.push(result.current.message);
    }
    expect(messages.every((message) => message && message.length <= 40)).toBe(
      true,
    );
    expect(new Set(messages).size).toBe(3);
  });
  it("コツの時刻に0枚案内が重なっても8秒間優先する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ noteCount }) =>
        useCharacterHint({
          phase,
          timer: { ...running, endsAt: 900_000 },
          serverOffsetMs: 0,
          noteCount,
        }),
      { initialProps: { noteCount: 1 } },
    );
    act(() => vi.advanceTimersByTime(59_000));
    rerender({ noteCount: 0 });
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.message).toContain("まず1枚");
  });
  it("未開始でも工程開始を案内し、工程変更で次の案内へ切り替える", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ step }) =>
        useCharacterHint({
          phase: { kind: "step", phase: 1, step },
          timer: { status: "idle" },
          serverOffsetMs: 0,
          noteCount: 1,
        }),
      { initialProps: { step: 1 } },
    );
    const first = result.current.message;
    expect(first).toBeTruthy();
    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.message).toBeNull();
    rerender({ step: 2 });
    expect(result.current.message).toBeTruthy();
    expect(result.current.message).not.toBe(first);
  });
  it("60秒ごとに異なるコツを出し、使い切ると止める", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: { ...running, endsAt: 900_000 },
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    const opening = result.current.message;
    act(() => vi.advanceTimersByTime(60_000));
    const first = result.current.message;
    expect(first).toBeTruthy();
    expect(first).not.toBe(opening);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.message).toBeTruthy();
    expect(result.current.message).not.toBe(first);
    act(() => vi.advanceTimersByTime(120_000));
    expect(result.current.message).toBeNull();
  });
  it("停止中はコツを出さず、再開後に残りのコツを出す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ timer }: { timer: TimerState }) =>
        useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 1 }),
      {
        initialProps: {
          timer: {
            status: "paused",
            remainingMs: 900_000,
            durationMs: 900_000,
          } as TimerState,
        },
      },
    );
    act(() => vi.advanceTimersByTime(120_000));
    expect(result.current.message).toBeNull();
    rerender({ timer: { ...running, endsAt: 900_000 } });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.message).toBeTruthy();
  });
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
    expect(result.current.message).toContain("最近困ったこと");
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
