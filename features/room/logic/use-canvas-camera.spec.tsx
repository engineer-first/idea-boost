import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import { useCanvasCamera } from "./use-canvas-camera";

describe("useCanvasCamera", () => {
  it("マップでは付箋座標ではなく1600×900の平面全体を初期表示する", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 800);
    const viewportRef = { current: viewport };
    const { result } = renderHook(() =>
      useCanvasCamera({
        viewportRef,
        notes: buildNotes(2),
        fitViewport: true,
      }),
    );
    expect(result.current.camera.zoom).toBeCloseTo(0.545);
    expect(result.current.camera.x).toBeCloseTo(227.5);
    expect(result.current.camera.y).toBeCloseTo(182);
  });

  it("初期表示後にユーザーが付箋を動かした場合、最初の共有付箋でカメラを自動移動しない", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 500, 400);
    const note = document.createElement("div");
    note.dataset.testid = "note-card";
    const surface = document.createElement("button");
    note.append(surface);
    const { result, rerender } = renderHook(
      ({ notes }) =>
        useCanvasCamera({ viewportRef: { current: viewport }, notes }),
      { initialProps: { notes: [] as ReturnType<typeof buildNotes> } },
    );
    const cameraBeforeDrag = result.current.camera;

    act(() => {
      result.current.handlePointerDown({
        target: surface,
        currentTarget: viewport,
        button: 0,
        pointerId: 1,
        clientX: 120,
        clientY: 130,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as PointerEvent<HTMLDivElement>);
    });
    act(() => rerender({ notes: buildNotes(1) }));

    expect(result.current.camera).toEqual(cameraBeforeDrag);
  });

  it("初期スナップショットとして後から届いた付箋には一度だけ自動フィットする", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 500, 400);
    const { result, rerender } = renderHook(
      ({ notes }) =>
        useCanvasCamera({ viewportRef: { current: viewport }, notes }),
      { initialProps: { notes: [] as ReturnType<typeof buildNotes> } },
    );
    const defaultCamera = result.current.camera;

    act(() => rerender({ notes: buildNotes(1) }));

    expect(result.current.camera).not.toEqual(defaultCamera);
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
