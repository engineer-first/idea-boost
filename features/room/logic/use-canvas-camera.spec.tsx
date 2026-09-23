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

  it("初期化されたサイズ段階の実寸で2軸マップを全体表示する", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 500, 400);
    const viewportRef = { current: viewport };
    const { result } = renderHook(() =>
      useCanvasCamera({
        viewportRef,
        notes: [],
        fitViewport: true,
        ideaMapSizeLevel: 2,
        ideaMapSizeInitialized: true,
      }),
    );

    const expectedZoom = 372 / 1936;
    expect(result.current.camera.zoom).toBeCloseTo(expectedZoom);
    expect(result.current.camera.x).toBeCloseTo(
      (500 - 1936 * expectedZoom) / 2 + 550 * expectedZoom,
    );
    expect(result.current.camera.y).toBeCloseTo(
      (400 - 1089 * expectedZoom) / 2 + 439 * expectedZoom,
    );
  });

  it("リモートのサイズ変更で個人カメラを保ち、手動fitは最新サイズを使う", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 500, 400);
    const viewportRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ ideaMapSizeLevel }) =>
        useCanvasCamera({
          viewportRef,
          notes: [],
          fitViewport: true,
          ideaMapSizeLevel,
          ideaMapSizeInitialized: true,
        }),
      { initialProps: { ideaMapSizeLevel: 0 } },
    );
    const personalCamera = result.current.camera;

    rerender({ ideaMapSizeLevel: 3 });
    expect(result.current.camera).toEqual(personalCamera);

    act(() => result.current.fitToNotes());
    expect(result.current.camera.zoom).toBeCloseTo(372 / 2130);
  });

  it("付箋全体表示は長文で伸びた実高まで画面内へ収める", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400);
    const viewportRef = { current: viewport };
    const short = renderHook(() =>
      useCanvasCamera({
        viewportRef,
        notes: buildNotes(1),
      }),
    );
    const long = renderHook(() =>
      useCanvasCamera({
        viewportRef,
        notes: [
          {
            ...buildNotes(1)[0],
            content: "あ".repeat(2_000),
            fontSize: 24,
          },
        ],
      }),
    );

    act(() => short.result.current.fitToNotes());
    act(() => long.result.current.fitToNotes());

    expect(long.result.current.camera.zoom).toBeLessThan(
      short.result.current.camera.zoom,
    );
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
