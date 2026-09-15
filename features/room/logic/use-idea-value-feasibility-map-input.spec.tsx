import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";

describe("useIdeaValueFeasibilityMapInput", () => {
  it("Step 3-2ではマップ平面のクライアント座標を0〜100へ変換する", () => {
    const fallbackPointFromClient = vi.fn();
    const { result } = renderHook(() =>
      useIdeaValueFeasibilityMapInput({
        phase: buildPhaseStep(2, 3),
        fallbackPointFromClient,
      }),
    );
    result.current.ideaMapPlaneRef.current = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 100,
        right: 500,
        bottom: 500,
      }),
    } as HTMLDivElement;

    expect(result.current.pointFromClient(300, 300)).toEqual({ x: 50, y: 50 });
    // つかみ位置を差し引いた後でuseBoardDragが制限する。先に丸めると端まで届かない。
    expect(result.current.pointFromClient(540, 540)?.x).toBeCloseTo(110);
    expect(result.current.pointFromClient(540, 540)?.y).toBeCloseTo(-10);
    expect(fallbackPointFromClient).not.toHaveBeenCalled();
  });

  it("2軸マップの配置ステップ以外では通常キャンバスの座標変換を使う", () => {
    const fallbackPointFromClient = vi.fn(() => ({ x: 320, y: 180 }));
    const { result } = renderHook(() =>
      useIdeaValueFeasibilityMapInput({
        phase: buildPhaseStep(4, 3),
        fallbackPointFromClient,
      }),
    );

    expect(result.current.pointFromClient(300, 300)).toEqual({
      x: 320,
      y: 180,
    });
    expect(fallbackPointFromClient).toHaveBeenCalledWith(300, 300);
  });
});
