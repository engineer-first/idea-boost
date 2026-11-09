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
const long: TimerState = {
  status: "running",
  endsAt: 900_000,
  durationMs: 900_000,
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
  )("工程 $phase-$step で開始案内と3つのコツを出す", (phase) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: long,
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    const messages = [result.current.message];
    for (const wait of [30_000, 60_000, 90_000]) {
      act(() => vi.advanceTimersByTime(wait));
      messages.push(result.current.message);
    }
    expect(messages.every((message) => message && message.length <= 40)).toBe(
      true,
    );
    expect(new Set(messages).size).toBe(4);
  });
  it("コツの時刻に0枚案内が重なっても8秒間優先する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ noteCount }) =>
        useCharacterHint({
          phase,
          timer: long,
          serverOffsetMs: 0,
          noteCount,
        }),
      { initialProps: { noteCount: 1 } },
    );
    act(() => vi.advanceTimersByTime(29_000));
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
  it("タイマー開始から30秒・90秒・180秒にコツを出し、その後は止める", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() =>
      useCharacterHint({ phase, timer: long, serverOffsetMs: 0, noteCount: 1 }),
    );
    const shown: string[] = [result.current.message ?? ""];
    act(() => vi.advanceTimersByTime(8_000));
    for (let second = 9; second <= 600; second += 1) {
      act(() => vi.advanceTimersByTime(1_000));
      const message = result.current.message;
      if (message && message !== shown.at(-1)) {
        shown.push(message);
        expect([30, 90, 180]).toContain(second);
      }
    }
    expect(new Set(shown.slice(1)).size).toBe(3);
  });
  it("途中から参加しても、過ぎたコツはまとめて出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() =>
      useCharacterHint({
        phase,
        timer: long,
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    expect(result.current.message).toContain("最近困ったこと");
    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(71_000));
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.message).toBeTruthy();
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
    rerender({ timer: { ...long, endsAt: 1_020_000 } });
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.message).toBeTruthy();
  });
  it("個人作業で30秒書いていないと案内し、8秒後に消える", () => {
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
    expect(result.current.message ?? "").not.toContain("まず1枚");
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.message).toContain("残り30秒");
  });
  it.each(["running", "ended", "idle"] as const)(
    "%s から張り直したタイマーでは開始案内を繰り返さず、コツ・残り30秒・時間切れを再び出す",
    (status) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { result, rerender } = renderHook(
        ({ timer }: { timer: TimerState }) =>
          useCharacterHint({
            phase: { ...phase, step: 2 },
            timer,
            serverOffsetMs: 0,
            noteCount: 1,
          }),
        { initialProps: { timer: running as TimerState } },
      );
      act(() => vi.advanceTimersByTime(30_000));
      const firstTip = result.current.message;
      act(() => vi.advanceTimersByTime(60_000));
      const secondTip = result.current.message;
      act(() => vi.advanceTimersByTime(60_000));
      expect(result.current.message).toContain("残り30秒");
      if (status !== "running") {
        act(() => vi.advanceTimersByTime(30_000));
        rerender({
          timer:
            status === "ended" ? { status, durationMs: 180_000 } : { status },
        });
      }
      act(() => vi.advanceTimersByTime(8_000));
      rerender({ timer: { ...running, endsAt: Date.now() + 180_000 } });
      expect(result.current.message).toBeNull();
      act(() => vi.advanceTimersByTime(29_000));
      expect(result.current.message).toBeNull();
      act(() => vi.advanceTimersByTime(1_000));
      expect(result.current.message).toBe(firstTip);
      act(() => vi.advanceTimersByTime(60_000));
      expect(result.current.message).toBe(secondTip);
      act(() => vi.advanceTimersByTime(60_000));
      expect(result.current.message).toContain("残り30秒");
      act(() => vi.advanceTimersByTime(30_000));
      expect(result.current.message).toBe(
        "時間になったよ、次の人にバトンを渡そう。",
      );
    },
  );
  it.each([1, 2, 3])("%i-2 の時間切れは次の発表者へ案内する", (phaseNumber) => {
    const { result } = renderHook(() =>
      useCharacterHint({
        phase: { kind: "step", phase: phaseNumber, step: 2 } as RoomPhase,
        timer: { status: "ended", durationMs: 180_000 },
        serverOffsetMs: 0,
        noteCount: 1,
      }),
    );
    expect(result.current.message).toBe(
      "時間になったよ、次の人にバトンを渡そう。",
    );
  });
  it("タイマーを張り直しても0枚の案内は工程で1回に保つ", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ timer }: { timer: TimerState }) =>
        useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 0 }),
      { initialProps: { timer: long as TimerState } },
    );
    act(() => vi.advanceTimersByTime(40_000));
    rerender({ timer: { ...long, endsAt: Date.now() + 900_000 } });
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.message).toContain("誰が");
  });
  it.each(["paused", "extension", "small-rewind"])(
    "%s はコツの既表示をリセットしない",
    (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { result, rerender } = renderHook(
        ({ timer }: { timer: TimerState }) =>
          useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 1 }),
        { initialProps: { timer: long as TimerState } },
      );
      act(() => vi.advanceTimersByTime(40_000));
      if (kind === "paused")
        rerender({
          timer: {
            status: "paused",
            remainingMs: 860_000,
            durationMs: 900_000,
          },
        });
      rerender({
        timer:
          kind === "extension"
            ? { ...long, durationMs: 960_000, endsAt: 960_000 }
            : { ...long, endsAt: kind === "small-rewind" ? 901_000 : 900_000 },
      });
      act(() => vi.advanceTimersByTime(30_000));
      expect(result.current.message).toBeNull();
      act(() =>
        vi.advanceTimersByTime(kind === "small-rewind" ? 21_000 : 20_000),
      );
      expect(result.current.message).toContain("小さな不便");
    },
  );
  it("経過時間がちょうど2秒戻るとコツを数え直す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ timer }: { timer: TimerState }) =>
        useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 1 }),
      { initialProps: { timer: long as TimerState } },
    );
    act(() => vi.advanceTimersByTime(30_000));
    const firstTip = result.current.message;
    act(() => vi.advanceTimersByTime(8_000));
    // 最後の観測38秒から29秒へ戻した後、31秒から29秒へちょうど2秒戻す。
    rerender({ timer: { ...long, endsAt: 909_000 } });
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ timer: { ...long, endsAt: 911_000 } });
    act(() => vi.advanceTimersByTime(1_000));
    act(() => vi.advanceTimersByTime(7_000));
    expect(result.current.message).toBe(firstTip);
  });
  it("張り直したタイマーを経過40秒で観測したとき30秒のコツを遡って出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(
      ({ timer }: { timer: TimerState }) =>
        useCharacterHint({ phase, timer, serverOffsetMs: 0, noteCount: 1 }),
      { initialProps: { timer: long as TimerState } },
    );
    act(() => vi.advanceTimersByTime(100_000));
    rerender({ timer: { ...long, endsAt: 960_000 } });
    act(() => vi.advanceTimersByTime(49_000));
    expect(result.current.message).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.message).toContain("小さな不便");
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
