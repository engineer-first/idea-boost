import { act, renderHook, waitFor } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import { useCanvasCamera } from "./use-canvas-camera";

describe("useCanvasCamera", () => {
  it("非表示の間はviewport操作を登録せず、再表示時にwheel操作を有効にする", () => {
    const viewport = document.createElement("div");
    viewport.hidden = true;
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400);
    const viewportRef = { current: viewport };
    const { result, rerender } = renderHook(
      ({ isViewportEnabled }) =>
        useCanvasCamera({ viewportRef, notes: [], isViewportEnabled }),
      { initialProps: { isViewportEnabled: false } },
    );

    const hiddenCamera = result.current.cameraRef.current;
    act(() =>
      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 80,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(result.current.cameraRef.current).toEqual(hiddenCamera);

    viewport.hidden = false;
    rerender({ isViewportEnabled: true });
    const visibleCamera = result.current.cameraRef.current;
    act(() =>
      viewport.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 80,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

    expect(result.current.cameraRef.current.y).toBe(visibleCamera.y - 80);
  });

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
      pointerType: "touch",
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
      pointerType: "touch",
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
    surface.dataset.canvasNoteSurface = "true";
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

it("Shift縦wheelは水平だけを移動する", () => {
  const viewport = document.createElement("div");
  const { result } = renderHook(() =>
    useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
  );
  const before = result.current.cameraRef.current;
  act(() =>
    result.current.handleWheel(
      new WheelEvent("wheel", { deltaY: 80, shiftKey: true }),
    ),
  );
  expect(result.current.cameraRef.current.x).toBe(before.x - 80);
  expect(result.current.cameraRef.current.y).toBe(before.y);
});

it("selectのmouse空白押下はカメラを移動しない", () => {
  const viewport = document.createElement("div");
  const { result } = renderHook(() =>
    useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
  );
  act(() =>
    result.current.handlePointerDown({
      target: viewport,
      currentTarget: viewport,
      button: 0,
      pointerType: "mouse",
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent<HTMLDivElement>),
  );
  expect(result.current.isPanning).toBe(false);
});

it("取得済みpanは別pointerの押下・upで奪われず、handの付箋上パンだけが動く", () => {
  const viewport = document.createElement("div");
  const card = document.createElement("div");
  card.dataset.testid = "note-card";
  const surface = document.createElement("button");
  surface.dataset.canvasNoteSurface = "true";
  card.append(surface);
  viewport.append(card);
  const viewportRef = { current: viewport };
  const { result } = renderHook(() =>
    useCanvasCamera({ viewportRef, notes: [] }),
  );
  const event = {
    target: surface,
    currentTarget: viewport,
    button: 0,
    buttons: 1,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLDivElement>;
  act(() => result.current.setInteractionTool("hand"));
  act(() => result.current.handlePointerDown(event));
  act(() =>
    result.current.handlePointerDown({ ...event, pointerId: 2, clientX: 100 }),
  );
  act(() => result.current.handlePointerEnd({ ...event, pointerId: 2 }));
  act(() => result.current.handlePointerMove({ ...event, clientX: 50 }));
  expect(result.current.cameraRef.current.x).toBe(40);
  expect(result.current.isPanning).toBe(true);
});

it("native button Spaceはパン保持にせず、付箋Spaceは一時パンとして処理する", () => {
  const viewport = document.createElement("div");
  const card = document.createElement("div");
  card.dataset.testid = "note-card";
  const surface = document.createElement("button");
  surface.dataset.canvasNoteSurface = "true";
  card.append(surface);
  viewport.append(card);
  const native = document.createElement("button");
  viewport.append(native);
  document.body.append(viewport);
  const viewportRef = { current: viewport };
  const { result, unmount } = renderHook(() =>
    useCanvasCamera({ viewportRef, notes: [] }),
  );
  const event = {
    target: surface,
    currentTarget: viewport,
    button: 0,
    buttons: 1,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLDivElement>;
  try {
    act(() =>
      native.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      ),
    );
    act(() => result.current.handlePointerDown(event));
    expect(result.current.isPanning).toBe(false);
    act(() =>
      surface.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      ),
    );
    act(() => result.current.handlePointerDown(event));
    expect(result.current.isPanning).toBe(true);
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", code: "Space" }),
      ),
    );
    expect(result.current.isPanning).toBe(false);
  } finally {
    unmount();
    viewport.remove();
  }
});

it("Shift二軸wheelもY不変で、gesture所有中はwheelとzoomを処理しない", () => {
  const viewport = document.createElement("div");
  const viewportRef = { current: viewport };
  const { result } = renderHook(() =>
    useCanvasCamera({ viewportRef, notes: [] }),
  );
  const original = result.current.cameraRef.current;
  act(() =>
    result.current.handleWheel(
      new WheelEvent("wheel", { deltaX: 30, deltaY: 80, shiftKey: true }),
    ),
  );
  expect(result.current.cameraRef.current).toEqual({
    ...original,
    x: original.x - 30,
  });
  const before = result.current.cameraRef.current;
  act(() => result.current.setGestureBlocked(true));
  const wheel = new WheelEvent("wheel", { deltaY: 80, cancelable: true });
  act(() => result.current.handleWheel(wheel));
  act(() => result.current.zoomIn());
  expect(result.current.cameraRef.current).toEqual(before);
  expect(wheel.defaultPrevented).toBe(false);
});

it("空白で選択操作を始めた後の他者追加はカメラを自動fitしない", () => {
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 500, 400);
  const viewportRef = { current: viewport };
  const { result, rerender } = renderHook(
    ({ notes }) => useCanvasCamera({ viewportRef, notes }),
    { initialProps: { notes: [] as ReturnType<typeof buildNotes> } },
  );
  const before = result.current.camera;
  act(() =>
    result.current.handlePointerDown({
      target: viewport,
      currentTarget: viewport,
      button: 0,
      pointerType: "mouse",
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent<HTMLDivElement>),
  );
  rerender({ notes: buildNotes(1) });
  expect(result.current.camera).toEqual(before);
});

it("note内nativeシールbuttonのSpaceはdefaultを防がずパン保持にしない", () => {
  const viewport = document.createElement("div");
  const card = document.createElement("div");
  card.dataset.testid = "note-card";
  const sticker = document.createElement("button");
  card.append(sticker);
  viewport.append(card);
  document.body.append(viewport);
  const { result, unmount } = renderHook(() =>
    useCanvasCamera({ viewportRef: { current: viewport }, notes: [] }),
  );
  const key = new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    bubbles: true,
    cancelable: true,
  });
  act(() => sticker.dispatchEvent(key));
  expect(key.defaultPrevented).toBe(false);
  const down = {
    target: viewport,
    currentTarget: viewport,
    pointerId: 81,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLDivElement>;
  act(() => result.current.handlePointerDown(down));
  expect(result.current.isPanning).toBe(false);
  unmount();
  viewport.remove();
});
