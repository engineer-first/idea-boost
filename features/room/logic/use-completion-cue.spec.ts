import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompletionCue } from "./use-completion-cue";

function setup(
  overrides: Partial<Parameters<typeof useCompletionCue>[0]> = {},
) {
  const options = {
    scope: "room:1",
    disabled: false,
    ready: false,
    canAdvance: false,
    onReady: vi.fn(),
    ...overrides,
  };
  return {
    options,
    ...renderHook((props) => useCompletionCue(props), {
      initialProps: options,
    }),
  };
}
function tick(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
function throughAttention() {
  tick(380);
  tick(440);
}

describe("完了の視線誘導", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("本人の完了を受信してからチェックを描き、最新の人数条件で進行を要求する", () => {
    const { result, rerender, options } = setup({ canAdvance: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    throughAttention();
    expect(options.onReady).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.stage).toBe("waiting");
    tick(1500);
    expect(proceed).not.toHaveBeenCalled();
    rerender({ ...options, ready: true });
    expect(result.current.stage).toBe("check");
    tick(399);
    expect(proceed).not.toHaveBeenCalled();
    tick(1);
    expect(proceed).toHaveBeenCalledOnce();
  });
  it("送信できなければ待ちやチェックを確定させず操作を戻す", () => {
    const { result } = setup({ onReady: vi.fn(() => false) });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    throughAttention();
    expect(result.current.stage).toBe("idle");
    expect(proceed).not.toHaveBeenCalled();
  });
  it("直接の完了は送信とチェックだけで進行しない", () => {
    const { result, rerender, options } = setup({ canAdvance: true });
    act(() => result.current.request(null));
    expect(result.current.stage).toBe("self");
    tick(440);
    rerender({ ...options, ready: true });
    tick(400);
    expect(options.onReady).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.stage).toBe("idle");
  });
  it("完了済みなら付け直さず、不足時だけ他者を示す", () => {
    const { result, options } = setup({ ready: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    tick(440);
    expect(result.current.stage).toBe("others");
    expect(options.onReady).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();
    tick(800);
    expect(result.current.busy).toBe(false);
  });
  it("完了済みの注目中に取消を受信したら、完了を付け直さない", () => {
    const { result, rerender, options } = setup({ ready: true });
    act(() => result.current.request(vi.fn()));
    rerender({ ...options, ready: false });
    tick(440);
    expect(options.onReady).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("idle");
  });
  it("完了済みで人数を満たせばすぐに既存確認へ渡す", () => {
    const { result, options } = setup({ ready: true, canAdvance: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    expect(proceed).toHaveBeenCalledOnce();
    expect(options.onReady).not.toHaveBeenCalled();
  });
  it.each(["scope", "disabled"] as const)(
    "%sの切替で送信前の遅延処理を破棄する",
    (key) => {
      const { result, rerender, options } = setup();
      const proceed = vi.fn();
      act(() => result.current.request(proceed));
      tick(380);
      rerender({ ...options, [key]: key === "scope" ? "room:2" : true });
      tick(10000);
      expect(options.onReady).not.toHaveBeenCalled();
      expect(proceed).not.toHaveBeenCalled();
      expect(result.current.stage).toBe("idle");
    },
  );
  it("連打しても一回だけ送信し、応答が来なければ進行せず操作を戻す", () => {
    const { result, options } = setup();
    const proceed = vi.fn();
    act(() => {
      result.current.request(proceed);
      result.current.request(proceed);
    });
    throughAttention();
    tick(8000);
    expect(options.onReady).toHaveBeenCalledExactlyOnceWith(true);
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("idle");
  });
  it("チェック中に人数が不足へ変わると進めず、人数が満たされたら待ちの輪郭を消す", () => {
    const { result, rerender, options } = setup({ canAdvance: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    throughAttention();
    rerender({ ...options, ready: true, canAdvance: false });
    tick(400);
    expect(result.current.stage).toBe("others");
    expect(proceed).not.toHaveBeenCalled();
    rerender({ ...options, ready: true });
    expect(result.current.stage).toBe("idle");
    expect(proceed).not.toHaveBeenCalled();
  });
  it("送信後の切断と再接続では遅れた応答から進行しない", () => {
    const { result, rerender, options } = setup({ canAdvance: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    throughAttention();
    rerender({ ...options, disabled: true });
    rerender({ ...options, ready: true });
    tick(10000);
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("idle");
  });
  it("チェック中に完了が取り消されたら進行と演出を破棄する", () => {
    const { result, rerender, options } = setup({ canAdvance: true });
    const proceed = vi.fn();
    act(() => result.current.request(proceed));
    throughAttention();
    rerender({ ...options, ready: true });
    rerender(options);
    tick(1000);
    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.stage).toBe("idle");
  });
});
