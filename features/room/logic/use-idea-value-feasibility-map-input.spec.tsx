import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { useIdeaValueFeasibilityMapInput } from "./use-idea-value-feasibility-map-input";

describe("useIdeaValueFeasibilityMapInput", () => {
  it("Step 3-3ではマップ平面のクライアント座標を0〜100へ変換する", () => {
    const fallbackPointFromClient = vi.fn();
    const { result } = renderHook(() =>
      useIdeaValueFeasibilityMapInput({
        phase: buildPhaseStep(3, 3),
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

  it("Step 3-2ではマップ平面のクライアント座標を0〜100へ変換する", () => {
    const fallbackPointFromClient = vi.fn(() => ({ x: 320, y: 180 }));
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
    expect(fallbackPointFromClient).not.toHaveBeenCalled();
  });

  it("内部表示倍率が反映された付箋領域でも表示位置を評価座標へ逆変換する", () => {
    const { result } = renderHook(() =>
      useIdeaValueFeasibilityMapInput({
        phase: buildPhaseStep(2, 3),
        fallbackPointFromClient: vi.fn(),
      }),
    );
    // 400×400のマップ中央を基準に0.5倍表示した領域の境界。
    result.current.ideaMapPlaneRef.current = {
      getBoundingClientRect: () => ({
        left: 200,
        top: 200,
        right: 400,
        bottom: 400,
      }),
    } as HTMLDivElement;

    expect(result.current.pointFromClient(350, 250)).toEqual({
      x: 75,
      y: 75,
    });
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
