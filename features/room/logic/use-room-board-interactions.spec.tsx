import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildNote,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { useRoomBoardInteractions } from "./use-room-board-interactions";

function setup({
  phase = buildPhaseStep(2),
  withSharedDrag = false,
  withPrivateNote = false,
  draggingNoteId = null,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = true,
}: {
  phase?: RoomPhase;
  withSharedDrag?: boolean;
  withPrivateNote?: boolean;
  draggingNoteId?: string | null;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
} = {}) {
  const onCursorMove = vi.fn();
  const onCursorLeave = vi.fn();
  const onNoteDragCancel = vi.fn();
  const onNoteDragStart = vi.fn();
  const onPrivateNoteUnpublish = vi.fn();
  const notes = withSharedDrag
    ? [
        buildNote({
          id: "shared-1",
          authorId: "11111111-1111-4111-8111-111111111111",
          x: 100,
          y: 100,
        }),
      ]
    : [];
  const { result } = renderHook(() =>
    useRoomBoardInteractions({
      notes,
      privateNotes: withPrivateNote
        ? [buildNote({ id: "private-1", visibility: "private" })]
        : [],
      currentUserId: "11111111-1111-4111-8111-111111111111",
      draggingNoteId,
      phase,
      ideaMapSizeLevel,
      ideaMapSizeInitialized,
      onNoteDragStart,
      onNoteDragMove: vi.fn(),
      onNoteDragEnd: vi.fn(),
      onNoteDragCancel,
      onPrivateNotePublish: vi.fn(),
      onPrivateNoteUnpublish,
      onCursorMove,
      onCursorLeave,
    }),
  );
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
  result.current.boardScrollerRef.current = viewport;
  return {
    result,
    onCursorMove,
    onCursorLeave,
    onNoteDragCancel,
    onNoteDragStart,
    onPrivateNoteUnpublish,
    viewport,
  };
}

describe("useRoomBoardInteractions cursor input", () => {
  it("空のボードへ最初のマイ付箋をdropした後も本人のカメラを保つ", () => {
    const note = buildNote({ id: "private-first", visibility: "private" });
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 390, 600);
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(140, 250, 240, 320);
    const { result, rerender } = renderHook(
      ({ notes }: { notes: (typeof note)[] }) => {
        const interactions = useRoomBoardInteractions({
          notes,
          privateNotes: notes.length === 0 ? [note] : [],
          currentUserId: note.authorId,
          draggingNoteId: null,
          phase: buildPhaseStep(2),
          sharing: buildSharingState({
            status: "active",
            currentIndex: 0,
            order: [{ userId: note.authorId, name: "作者", color: note.color }],
          }),
          onNoteDragStart: vi.fn(),
          onNoteDragMove: vi.fn(),
          onNoteDragEnd: vi.fn(),
          onNoteDragCancel: vi.fn(),
          onPrivateNotePublish: vi.fn(),
          onPrivateNoteUnpublish: vi.fn(),
          onCursorMove: vi.fn(),
          onCursorLeave: vi.fn(),
        });
        interactions.boardScrollerRef.current = viewport;
        interactions.privateToolbarRef.current = toolbar;
        return interactions;
      },
      { initialProps: { notes: [] as (typeof note)[] } },
    );
    const camera = result.current.camera;
    act(() =>
      result.current.onPrivateNoteDragStart(note.id, {
        pointerId: 1,
        clientX: 180,
        clientY: 300,
        currentTarget: document.createElement("button"),
      } as unknown as PointerEvent<HTMLButtonElement>),
    );
    act(() =>
      result.current.onPointerEnd({
        pointerId: 1,
        clientX: 60,
        clientY: 100,
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    rerender({ notes: [{ ...note, visibility: "shared", x: 700, y: 300 }] });
    expect(result.current.camera).toEqual(camera);
  });

  it("共有drag中も余白の実カーソル座標と操作対象を送る", () => {
    const { result, onCursorMove, viewport } = setup({
      phase: buildPhaseStep(3, 3),
      withSharedDrag: true,
      draggingNoteId: "shared-1",
    });
    const plane = document.createElement("div");
    plane.getBoundingClientRect = () => new DOMRect(100, 200, 400, 200);
    result.current.ideaMapPlaneRef.current = plane;
    act(() =>
      result.current.onNoteDragStart("shared-1", {
        pointerId: 15,
        clientX: 300,
        clientY: 250,
        currentTarget: {
          getBoundingClientRect: () => new DOMRect(200, 200, 200, 150),
        },
      } as unknown as PointerEvent<HTMLButtonElement>),
    );
    act(() =>
      result.current.onPresencePointerMove({
        pointerId: 15,
        clientX: 550,
        clientY: 300,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).toHaveBeenLastCalledWith(
      { x: 112.5, y: 50 },
      "shared-1",
    );
  });

  it.each([
    2, 3, 5,
  ])("3-%iのマップ四辺の外もcanvas上なら範囲を丸めず送信する", (step) => {
    const { result, onCursorMove, onCursorLeave, viewport } = setup({
      phase: buildPhaseStep(step, 3),
    });
    const plane = document.createElement("div");
    plane.getBoundingClientRect = () => new DOMRect(100, 200, 400, 200);
    result.current.ideaMapPlaneRef.current = plane;
    for (const [clientX, clientY, x, y] of [
      [550, 300, 112.5, 50],
      [50, 300, -12.5, 50],
      [300, 150, 50, 125],
      [300, 450, 50, -25],
    ]) {
      act(() =>
        result.current.onPresencePointerMove({
          clientX,
          clientY,
          pointerType: "mouse",
          target: viewport,
        } as unknown as PointerEvent<HTMLDivElement>),
      );
      expect(onCursorMove).toHaveBeenLastCalledWith({ x, y }, null);
    }
    expect(onCursorLeave).not.toHaveBeenCalled();
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 850,
        clientY: 300,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorLeave).toHaveBeenCalledOnce();
  });

  it("共有キャンバスの client 座標を board 座標へ変換する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).toHaveBeenCalledWith({ x: 40, y: 40 }, null);
  });

  it("パン・ズーム後も client 座標を同じ board 座標系へ変換する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() => {
      result.current.onCanvasPointerDown({
        button: 1,
        clientX: 100,
        clientY: 100,
        currentTarget: viewport,
        pointerId: 1,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onCanvasPointerMove({
        clientX: 150,
        clientY: 120,
        currentTarget: viewport,
        pointerId: 1,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onCanvasPointerEnd({
        pointerId: 1,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onZoomIn();
      result.current.onPresencePointerMove({
        clientX: 60,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorMove).toHaveBeenCalledWith({ x: 70, y: 72 }, null);
  });

  it("2軸マップでは左下を原点にした百分率へ変換する", () => {
    const { result, onCursorMove } = setup({ phase: buildPhaseStep(2, 3) });
    const plane = document.createElement("div");
    plane.getBoundingClientRect = () => new DOMRect(100, 200, 400, 200);
    result.current.ideaMapPlaneRef.current = plane;

    act(() =>
      result.current.onPresencePointerMove({
        clientX: 300,
        clientY: 250,
        pointerType: "mouse",
        target: plane,
      } as unknown as PointerEvent<HTMLDivElement>),
    );

    expect(onCursorMove).toHaveBeenCalledWith({ x: 50, y: 75 }, null);
  });

  it("全体表示操作で共有された2軸マップ寸法を使う", () => {
    const { result, viewport } = setup({
      phase: buildPhaseStep(2, 3),
      ideaMapSizeLevel: 1,
      ideaMapSizeInitialized: true,
    });
    result.current.boardScrollerRef.current = viewport;

    act(() => result.current.onFitToNotes());

    expect(result.current.camera.zoom).toBeCloseTo(672 / 1760);
  });

  it("3-2のprivate previewはpointerdownで他者配信されるlockを要求しない", () => {
    const { result, onNoteDragStart } = setup({
      phase: buildPhaseStep(2, 3),
      withPrivateNote: true,
    });

    act(() =>
      result.current.onPrivateNoteDragStart("private-1", {
        pointerId: 15,
        clientX: 700,
        clientY: 560,
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 600,
            top: 500,
            right: 800,
            bottom: 650,
            width: 200,
            height: 150,
          }),
        },
      } as unknown as PointerEvent<HTMLButtonElement>),
    );

    expect(onNoteDragStart).not.toHaveBeenCalled();
  });

  it("入力欄と touch の位置は送信せず、キャンバス退出を通知する", () => {
    const { result, onCursorMove, onCursorLeave } = setup();
    const input = document.createElement("textarea");
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: input,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "touch",
        target: document.createElement("div"),
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledTimes(2);
  });

  it("data-cursor-private 配下の個人UI位置は送信しない", () => {
    const { result, onCursorMove, onCursorLeave } = setup();
    const privateArea = document.createElement("div");
    privateArea.dataset.cursorPrivate = "true";
    const child = document.createElement("button");
    privateArea.append(child);

    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: child,
      } as unknown as PointerEvent<HTMLDivElement>),
    );

    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledOnce();
  });

  it("pointer end では操作対象を null にして解除する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() =>
      result.current.onPointerEnd({
        pointerId: 1,
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).toHaveBeenLastCalledWith({ x: 40, y: 40 }, null);
  });

  it("shared drag 中に private toolbar へ入ると操作権だけ解放し、unpublish はドロップまで遅延する", () => {
    const { result, onCursorLeave, onNoteDragCancel, onPrivateNoteUnpublish } =
      setup({
        withSharedDrag: true,
      });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 0, 300, 600);
    result.current.privateToolbarRef.current = toolbar;
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
    expect(onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.isNoteDragging).toBe(true);

    act(() => {
      result.current.onPointerMove({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPresencePointerMove({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
        pointerType: "mouse",
        target: toolbar,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
  });

  it("マイ付箋エリアの上側にある拡張認識範囲ではドラッグを解除しない", () => {
    const { result, onCursorLeave, onNoteDragCancel } = setup({
      withSharedDrag: true,
    });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 200, 200, 200);
    result.current.privateToolbarRef.current = toolbar;
    const surface = document.createElement("button");
    surface.getBoundingClientRect = () => new DOMRect(100, 100, 192, 144);

    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 150,
        clientY: 150,
        currentTarget: surface,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        pointerId: 7,
        clientX: 650,
        clientY: 130,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
    expect(result.current.isNoteDragging).toBe(true);
  });

  it("最初の共有付箋を戻すとき、ドラッグプレビューをマイ付箋一覧内に収める", () => {
    const { result } = setup({ withSharedDrag: true });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 0, 300, 600);
    const scrollContainer = document.createElement("section");
    scrollContainer.dataset.testid = "private-notes-scroll";
    scrollContainer.getBoundingClientRect = () =>
      new DOMRect(612, 128, 216, 350);
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 350,
    });
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 350,
    });
    toolbar.append(scrollContainer);
    result.current.privateToolbarRef.current = toolbar;

    const surface = document.createElement("button");
    surface.getBoundingClientRect = () => new DOMRect(100, 100, 192, 144);
    const originalRequestFrame = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const originalCancelFrame = Object.getOwnPropertyDescriptor(
      window,
      "cancelAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: () => 1,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: vi.fn(),
    });

    try {
      act(() => {
        result.current.onNoteDragStart("shared-1", {
          pointerId: 7,
          clientX: 150,
          clientY: 150,
          currentTarget: surface,
        } as unknown as PointerEvent<HTMLButtonElement>);
        result.current.onPointerMove({
          pointerId: 7,
          clientX: 650,
          clientY: 132,
        } as unknown as PointerEvent<HTMLDivElement>);
      });

      expect(result.current.dragPreview).toMatchObject({
        left: 612,
        top: 128,
      });

      act(() =>
        result.current.onPointerMove({
          pointerId: 7,
          clientX: 650,
          clientY: 470,
        } as unknown as PointerEvent<HTMLDivElement>),
      );

      expect(result.current.dragPreview?.top).toBe(334);
    } finally {
      if (originalRequestFrame) {
        Object.defineProperty(
          window,
          "requestAnimationFrame",
          originalRequestFrame,
        );
      } else {
        Reflect.deleteProperty(window, "requestAnimationFrame");
      }
      if (originalCancelFrame) {
        Object.defineProperty(
          window,
          "cancelAnimationFrame",
          originalCancelFrame,
        );
      } else {
        Reflect.deleteProperty(window, "cancelAnimationFrame");
      }
    }
  });

  it("shared drag 中に toolbar 以外へ出る presence leave は付箋操作とカーソルを同時に解除する", () => {
    const { result, onCursorLeave, onNoteDragCancel } = setup({
      withSharedDrag: true,
    });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        pointerId: 7,
        clientX: 950,
        clientY: 700,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.isNoteDragging).toBe(false);
  });

  it("shared drag 中は別 pointer の presence move と leave を無視する", () => {
    const { result, onCursorMove, onCursorLeave, onNoteDragCancel, viewport } =
      setup({ withSharedDrag: true });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerMove({
        pointerId: 8,
        pointerType: "mouse",
        clientX: 50,
        clientY: 60,
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPresencePointerLeave({
        pointerId: 8,
        clientX: 950,
        clientY: 700,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(result.current.isNoteDragging).toBe(true);
  });

  it("pointercancel は private toolbar 上でも shared drag を解除する", () => {
    const { result, onCursorLeave, onNoteDragCancel } = setup({
      withSharedDrag: true,
    });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 0, 300, 600);
    result.current.privateToolbarRef.current = toolbar;
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        type: "pointercancel",
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPointerCancel({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.isNoteDragging).toBe(false);
  });

  it("shared drag 中の境界外 pointermove はカーソルだけ解除し、真の leave までドラッグを維持する", () => {
    const { result, onCursorLeave, onNoteDragCancel, viewport } = setup({
      withSharedDrag: true,
    });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 9,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerMove({
        pointerId: 9,
        pointerType: "mouse",
        clientX: 900,
        clientY: 700,
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(result.current.isNoteDragging).toBe(true);
  });
});
it("AT-030: viewの複数選択drag入口を固定集合付き移動へ接続する", () => {
  const { result, onNoteDragStart } = setup({ withSharedDrag: true });
  act(() =>
    result.current.onSharedNotesDragIntent?.(
      ["shared-1", "shared-2", "shared-3"],
      {
        pointerId: 12,
        clientX: 100,
        clientY: 100,
        currentTarget: {
          getBoundingClientRect: () => new DOMRect(100, 100, 200, 150),
        },
      } as unknown as PointerEvent<HTMLButtonElement>,
    ),
  );
  expect(onNoteDragStart).toHaveBeenCalledWith("shared-1", false, [
    "shared-1",
    "shared-2",
    "shared-3",
  ]);
});
