import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHmwHintNudge } from "./use-hmw-hint-nudge";

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("問いヒントの呼びかけ", () => {
  it("表示後に切断・準備OKで止めた呼びかけは、作業へ戻っても再表示しない", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useHmwHintNudge({ scope: "reconnect", enabled, noteCount: 0 }),
      { initialProps: { enabled: true } },
    );
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.showNudge).toBe(true);
    rerender({ enabled: false });
    expect(result.current.showNudge).toBe(false);
    rerender({ enabled: true });
    expect(result.current.showNudge).toBe(false);
  });

  it("45秒の入力停滞で呼びかけ、一度閉じると同じ作業では再表示しない", () => {
    const { result, unmount } = renderHook(() =>
      useHmwHintNudge({ scope: "room:me:2-1:1", enabled: true, noteCount: 3 }),
    );
    act(() => vi.advanceTimersByTime(44_000));
    expect(result.current.showNudge).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.showNudge).toBe(true);
    act(() => result.current.dismiss());
    unmount();
    const again = renderHook(() =>
      useHmwHintNudge({ scope: "room:me:2-1:1", enabled: true, noteCount: 3 }),
    );
    act(() => vi.advanceTimersByTime(90_000));
    expect(again.result.current.showNudge).toBe(false);
  });

  it("少数の付箋では90秒かつ最後の入力から15秒を待って呼びかける", () => {
    const { result } = renderHook(() =>
      useHmwHintNudge({ scope: "few", enabled: true, noteCount: 1 }),
    );
    for (let i = 0; i < 3; i++) {
      act(() => vi.advanceTimersByTime(25_000));
      act(() => result.current.markActivity());
    }
    act(() => vi.advanceTimersByTime(14_000));
    expect(result.current.showNudge).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.showNudge).toBe(true);
  });

  it("説明ダイアログ・非表示タブ・日本語変換・通信待ちの時間を数えない", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useHmwHintNudge({ scope: "paused", enabled, noteCount: 0 }),
      { initialProps: { enabled: false } },
    );
    act(() => vi.advanceTimersByTime(60_000));
    rerender({ enabled: true });
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    act(() => vi.advanceTimersByTime(60_000));
    dialog.remove();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    act(() => vi.advanceTimersByTime(60_000));
    visibility.mockReturnValue("visible");
    act(() => result.current.setComposing(true));
    act(() => vi.advanceTimersByTime(60_000));
    act(() => result.current.setComposing(false));
    expect(result.current.showNudge).toBe(false);
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.showNudge).toBe(true);
  });
});
