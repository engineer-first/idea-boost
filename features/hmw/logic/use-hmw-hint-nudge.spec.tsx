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
  it("待ち時間をリセットしても、続いている日本語変換中は呼びかけない", () => {
    const { result } = renderHook(() =>
      useHmwHintNudge({
        scope: "repeat-during-composition",
        enabled: true,
        noteCount: 2,
      }),
    );
    act(() => vi.advanceTimersByTime(45_000));
    act(() => result.current.setComposing(true));
    act(() => result.current.restart());
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.showNudge).toBe(false);
    act(() => result.current.setComposing(false));
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.showNudge).toBe(true);
  });

  it("書き出し後に待ち時間をリセットすると、45秒無入力で再び呼びかける", () => {
    const { result } = renderHook(() =>
      useHmwHintNudge({
        scope: "repeat-after-writing",
        enabled: true,
        noteCount: 2,
      }),
    );
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.showNudge).toBe(true);
    const previousCycle = result.current.cycle;
    act(() => result.current.restart());
    expect(result.current.showNudge).toBe(false);
    expect(result.current.hasBeenShown).toBe(false);
    expect(result.current.cycle).toBe(previousCycle + 1);
    expect(
      sessionStorage.getItem("hmw-hint-nudge:repeat-after-writing"),
    ).toBeNull();
    act(() => vi.advanceTimersByTime(44_000));
    expect(result.current.showNudge).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.showNudge).toBe(true);
  });

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
    expect(result.current.hasBeenShown).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.showNudge).toBe(true);
    expect(result.current.hasBeenShown).toBe(true);
    act(() => result.current.dismiss());
    unmount();
    const again = renderHook(() =>
      useHmwHintNudge({ scope: "room:me:2-1:1", enabled: true, noteCount: 3 }),
    );
    act(() => vi.advanceTimersByTime(90_000));
    expect(again.result.current.showNudge).toBe(false);
    expect(again.result.current.hasBeenShown).toBe(true);
  });

  it.each([0, 1])(
    "本人の付箋が%i枚では90秒かつ最後の入力から15秒を待って呼びかける",
    (noteCount) => {
      const { result } = renderHook(() =>
        useHmwHintNudge({ scope: "few", enabled: true, noteCount }),
      );
      for (let i = 0; i < 3; i++) {
        act(() => vi.advanceTimersByTime(25_000));
        act(() => result.current.markActivity());
      }
      act(() => vi.advanceTimersByTime(14_000));
      expect(result.current.showNudge).toBe(false);
      act(() => vi.advanceTimersByTime(1_000));
      expect(result.current.showNudge).toBe(true);
    },
  );

  it("本人の付箋が2枚以上なら90秒・15秒無入力だけでは呼びかけない", () => {
    const { result } = renderHook(() =>
      useHmwHintNudge({ scope: "many", enabled: true, noteCount: 2 }),
    );
    for (let i = 0; i < 3; i++) {
      act(() => vi.advanceTimersByTime(25_000));
      act(() => result.current.markActivity());
    }
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.showNudge).toBe(false);
    act(() => vi.advanceTimersByTime(30_000));
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
