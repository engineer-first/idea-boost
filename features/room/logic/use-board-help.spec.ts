import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { useBoardHelp } from "./use-board-help";

afterEach(() => vi.restoreAllMocks());

describe("useBoardHelp", () => {
  it("639px以下は初回もヒントを閉じ、利用者が開いた状態は更新で保つ", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(639);
    const phase = buildPhaseStep(1, 3);
    const { result, rerender } = renderHook(
      ({ phase }) => useBoardHelp(phase),
      {
        initialProps: { phase },
      },
    );
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.onOpenChange(true));
    rerender({ phase: { ...phase } });
    expect(result.current.isOpen).toBe(true);
  });

  it.each([
    [1, 1, null, false],
    [1, 2, null, false],
    [1, 3, null, false],
    [1, 4, null, false],
    [1, 5, null, false],
    [2, 1, null, false],
    [2, 2, null, false],
    [2, 3, null, false],
    [2, 4, null, false],
    [3, 1, "idea", true],
    [3, 2, "reference", false],
    [3, 3, null, false],
    [3, 4, null, false],
    [3, 5, null, false],
  ] as const)("Step %i-%i の補助パネルを必要な状態だけにする", (phase, step, kind, isOpen) => {
    const { result } = renderHook(() =>
      useBoardHelp(buildPhaseStep(step, phase)),
    );
    expect(result.current.kind).toBe(kind);
    expect(result.current.isOpen).toBe(isOpen);
  });

  it("個人執筆中も閉じられ、同じステップのデータ更新では再展開しない", () => {
    const phase = buildPhaseStep(1, 3);
    const { result, rerender } = renderHook(
      ({ phase }) => useBoardHelp(phase),
      { initialProps: { phase } },
    );
    act(() => result.current.onOpenChange(false));
    rerender({ phase: { ...phase } });
    expect(result.current.isOpen).toBe(false);
  });

  it("タブを選べ、共有への遷移では閉じ、投票では非表示にする", () => {
    const { result, rerender } = renderHook(
      ({ phase }) => useBoardHelp(phase),
      { initialProps: { phase: buildPhaseStep(1, 3) } },
    );
    act(() => result.current.onTabChange("expand"));
    expect(result.current.tab).toBe("expand");
    rerender({ phase: buildPhaseStep(2, 3) });
    expect(result.current).toMatchObject({ kind: "reference", isOpen: false });
    act(() => result.current.onOpenChange(true));
    expect(result.current.isOpen).toBe(true);
    rerender({ phase: buildPhaseStep(4, 3) });
    expect(result.current).toMatchObject({ kind: null, isOpen: false });
  });
});

it("再訪の個人作業で導入説明を強制しない", () => {
  const { result, rerender } = renderHook(({ phase }) => useBoardHelp(phase), {
    initialProps: { phase: buildPhaseStep(1, 3) },
  });
  rerender({ phase: buildPhaseStep(2, 3) });
  rerender({ phase: buildPhaseStep(1, 3) });
  expect(result.current.isOpen).toBe(false);
});
