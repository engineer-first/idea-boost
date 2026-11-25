import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimerState } from "@/contracts/room-protocol";
import {
  TIMER_ALERT_VISIBLE_MS,
  type UseTimerAlertOptions,
  useTimerAlert,
} from "./use-timer-alert";

afterEach(() => vi.useRealTimers());

const running = (remainingMs: number, durationMs = 180_000): TimerState => ({
  status: "running",
  endsAt: remainingMs,
  durationMs,
});

function render(initial: UseTimerAlertOptions) {
  return renderHook((props: UseTimerAlertOptions) => useTimerAlert(props), {
    initialProps: initial,
  });
}

describe("タイマーの画面中央の通知", () => {
  it("残り1分と時間切れの瞬間にだけ出し、しばらくすると自動で消す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = render({ timer: running(180_000), serverOffsetMs: 0 });
    expect(result.current).toBeNull();

    act(() => vi.advanceTimersByTime(119_999));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("oneMinute");
    act(() => vi.advanceTimersByTime(TIMER_ALERT_VISIBLE_MS));
    expect(result.current).toBeNull();

    act(() => vi.advanceTimersByTime(60_000 - TIMER_ALERT_VISIBLE_MS));
    expect(result.current).toBe("timeUp");
    act(() => vi.advanceTimersByTime(TIMER_ALERT_VISIBLE_MS));
    expect(result.current).toBeNull();
  });

  it("サーバーから時間切れを受けても、同じ回の通知を重ねて出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = render({
      timer: running(30_000),
      serverOffsetMs: 0,
    });
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current).toBe("timeUp");
    act(() => vi.advanceTimersByTime(TIMER_ALERT_VISIBLE_MS));
    rerender({
      timer: { status: "ended", durationMs: 180_000 },
      serverOffsetMs: 0,
    });
    expect(result.current).toBeNull();
  });

  it("サーバーの時間切れが手元の予定より先に届いても、時間切れを出す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = render({
      timer: running(30_000),
      serverOffsetMs: -200,
    });
    act(() => vi.advanceTimersByTime(30_100));
    expect(result.current).toBeNull();
    rerender({
      timer: { status: "ended", durationMs: 180_000 },
      serverOffsetMs: -200,
    });
    expect(result.current).toBe("timeUp");
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe("timeUp");
  });

  it("延長した回の時間切れ直後に次へ進んでタイマーが未開始に戻っても、時間切れを出し切る", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = render({
      timer: running(60_000, 60_000),
      serverOffsetMs: 0,
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe("timeUp");
    rerender({ timer: { status: "idle" }, serverOffsetMs: 0 });
    act(() => vi.advanceTimersByTime(TIMER_ALERT_VISIBLE_MS - 100));
    expect(result.current).toBe("timeUp");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBeNull();
  });

  it("終了予定よりずっと前に止められたときは、時間切れを出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = render({
      timer: running(120_000),
      serverOffsetMs: 0,
    });
    act(() => vi.advanceTimersByTime(10_000));
    rerender({ timer: { status: "idle" }, serverOffsetMs: 0 });
    expect(result.current).toBeNull();
  });

  it("途中から見始めたときは、過ぎた残り1分を後から出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = render({ timer: running(45_000), serverOffsetMs: 0 });
    act(() => vi.advanceTimersByTime(44_000));
    expect(result.current).toBeNull();
  });

  it("設定時間が1分以下なら、開始直後に残り1分を出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = render({
      timer: running(60_000, 60_000),
      serverOffsetMs: 0,
    });
    act(() => vi.advanceTimersByTime(59_000));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe("timeUp");
  });

  it("一時停止したら予定していた通知を取り消し、表示中の通知も消す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = render({
      timer: running(61_000),
      serverOffsetMs: 0,
    });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe("oneMinute");
    rerender({
      timer: { status: "paused", remainingMs: 59_000, durationMs: 180_000 },
      serverOffsetMs: 0,
    });
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(120_000));
    expect(result.current).toBeNull();
  });

  it("サーバー時刻とのずれを補正して出す", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // サーバーの時計が10秒進んでいる。
    const { result } = render({
      timer: running(130_000),
      serverOffsetMs: 10_000,
    });
    act(() => vi.advanceTimersByTime(59_999));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("oneMinute");
  });

  it("無効なあいだは出さない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = render({
      timer: running(61_000),
      serverOffsetMs: 0,
      active: false,
    });
    act(() => vi.advanceTimersByTime(61_000));
    expect(result.current).toBeNull();
  });
});
