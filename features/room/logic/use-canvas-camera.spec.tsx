import { act, renderHook, waitFor } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import { useCanvasCamera } from "./use-canvas-camera";

describe("useCanvasCamera", () => {
  it("pointerupが届かなくてもボタンを離した移動でパンを終了する", () => {
    const viewport = document.createElement("div");
    const { result } = renderHook(() =>
      useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
    );
    const event = {
      target: viewport,
      currentTarget: viewport,
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent<HTMLDivElement>;
    act(() => result.current.handlePointerDown(event));
    act(() => result.current.handlePointerMove({ ...event, clientX: 30 }));
    expect(result.current.cameraRef.current.x).toBe(20);
    const cameraBeforeRelease = result.current.cameraRef.current;

    act(() =>
      result.current.handlePointerMove({
        ...event,
        buttons: 0,
        clientX: 80,
      }),
    );

    expect(result.current.cameraRef.current).toEqual(cameraBeforeRelease);
    expect(result.current.isPanning).toBe(false);
    act(() => result.current.handlePointerMove({ ...event, clientX: 100 }));
    expect(result.current.cameraRef.current).toEqual(cameraBeforeRelease);
  });

  it("ウィンドウがフォーカスを失ったらパンを終了する", () => {
    const viewport = document.createElement("div");
    const { result } = renderHook(() =>
      useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
    );
    const event = {
      target: viewport,
      currentTarget: viewport,
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent<HTMLDivElement>;
    act(() => result.current.handlePointerDown(event));
    expect(result.current.isPanning).toBe(true);

    act(() => window.dispatchEvent(new Event("blur")));
    act(() => result.current.handlePointerMove({ ...event, clientX: 80 }));

    expect(result.current.isPanning).toBe(false);
    expect(result.current.cameraRef.current.x).toBe(0);
  });

  it("表示操作にフォーカスした方向キーとPageDownで個人の視野を移動し、入力中は動かさない", async () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400);
    const frame = document.createElement("div");
    const controls = document.createElement("fieldset");
    controls.dataset.testid = "canvas-zoom-controls";
    const button = document.createElement("button");
    controls.append(button);
    frame.append(viewport, controls);
    document.body.append(frame);
    const input = document.createElement("textarea");
    viewport.append(input);
    const { result, unmount } = renderHook(() =>
      useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
    );
    const original = result.current.camera;
    try {
      act(() =>
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
          }),
        ),
      );
      await waitFor(() =>
        expect(result.current.camera.y).toBeLessThan(original.y),
      );
      const afterArrow = result.current.camera;
      act(() =>
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "PageDown",
            bubbles: true,
          }),
        ),
      );
      await waitFor(() =>
        expect(result.current.camera.y).toBeLessThan(afterArrow.y),
      );
      const afterPage = result.current.camera;
      act(() =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
          }),
        ),
      );
      expect(result.current.camera).toEqual(afterPage);
      expect(result.current.camera.x).toBe(original.x);
      expect(result.current.camera.zoom).toBe(original.zoom);
    } finally {
      unmount();
      frame.remove();
    }
  });

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

it("HUD変更は本人視野を変えず、明示fitと初期fitだけ最新insetsを使い安全領域なしなら視野を保つ", () => {
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 1280, 720);
  const viewportRef = { current: viewport };
  let top = 240;
  const getFitInsets = () => ({ top, left: 0, right: 0, bottom: 160 });
  const notes = buildNotes(1);
  const { result, rerender } = renderHook(() =>
    useCanvasCamera({ viewportRef, notes, getFitInsets }),
  );
  const initial = result.current.camera;
  expect(initial.y + notes[0].y * initial.zoom).toBeGreaterThanOrEqual(top);
  act(() => result.current.zoomTo(2));
  const before = result.current.cameraRef.current;
  top = 300;
  rerender();
  expect(result.current.cameraRef.current).toEqual(before);
  act(() => result.current.fitToNotes());
  expect(
    result.current.camera.y + notes[0].y * result.current.camera.zoom,
  ).toBeGreaterThanOrEqual(top);
  const fitted = result.current.camera;
  top = 600;
  act(() => expect(result.current.fitToNotes()).toBe(false));
  expect(result.current.camera).toEqual(fitted);
});
