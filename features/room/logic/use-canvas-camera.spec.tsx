import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import { useCanvasCamera } from "./use-canvas-camera";

describe("useCanvasCamera", () => {
  it("マップでは正規化された付箋座標に自動フィットせず、平面全体を初期表示する", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
    const { result } = renderHook(() =>
      useCanvasCamera({
        viewportRef: { current: viewport },
        notes: buildNotes(2),
        fitViewport: true,
      }),
    );
    expect(result.current.camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("中ボタンのパンは付箋に伝播せず、通常の付箋ドラッグはパンしない", () => {
    const viewport = document.createElement("div");
    const { result } = renderHook(() =>
      useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
    );
    const stopPropagation = vi.fn();
    const event = {
      target: document.createElement("button"),
      currentTarget: viewport,
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      stopPropagation,
    } as unknown as PointerEvent<HTMLDivElement>;
    act(() => result.current.handlePointerDown(event));
    expect(result.current.isPanning).toBe(false);
    act(() => result.current.handlePointerDown({ ...event, button: 1 }));
    expect(result.current.isPanning).toBe(true);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
