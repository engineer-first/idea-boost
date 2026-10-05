import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import { useCanvasSelection } from "./use-canvas-selection";

function setup() {
  const notes = buildNotes(3);
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  for (const [index, note] of notes.entries()) {
    const element = document.createElement("div");
    element.dataset.noteId = note.id;
    element.dataset.testid = "note-card";
    element.getBoundingClientRect = () => new DOMRect(index * 100, 50, 80, 80);
    viewport.append(element);
  }
  const viewportRef = { current: viewport };
  const { result, rerender } = renderHook(
    ({ currentNotes }) =>
      useCanvasSelection({
        viewportRef,
        notes: currentNotes,
      }),
    { initialProps: { currentNotes: notes } },
  );
  const event = (x: number, y: number, overrides = {}) =>
    ({
      target: viewport,
      currentTarget: viewport,
      button: 0,
      buttons: 1,
      pointerId: 7,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    }) as unknown as PointerEvent<HTMLDivElement>;
  return { result, rerender, notes, viewport, event };
}

describe("canvas selection", () => {
  it("逆方向の矩形も境界接触を含め選び、Shift矩形とclickで追加解除する", () => {
    const { result, notes, event } = setup();
    act(() => result.current.onPointerDown(event(180, 130)));
    act(() => result.current.onPointerMove(event(0, 50)));
    act(() => result.current.onPointerEnd(event(0, 50)));
    expect(result.current.selectedNoteIds).toEqual([notes[0].id, notes[1].id]);
    act(() => result.current.onPointerDown(event(200, 40, { shiftKey: true })));
    act(() => result.current.onPointerMove(event(290, 140)));
    act(() => result.current.onPointerEnd(event(290, 140)));
    expect(result.current.selectedNoteIds).toEqual(notes.map(({ id }) => id));
    act(() => result.current.selectNote(notes[1].id, { shiftKey: true }));
    expect(result.current.selectedNoteIds).toEqual([notes[0].id, notes[2].id]);
  });

  it("別pointerは矩形を奪わず、取消は押下時選択へ戻す", () => {
    const { result, notes, event } = setup();
    act(() => result.current.selectNote(notes[2].id));
    act(() => result.current.onPointerDown(event(0, 0)));
    act(() => result.current.onPointerDown(event(500, 500, { pointerId: 8 })));
    act(() => result.current.onPointerMove(event(190, 140)));
    act(() => result.current.onPointerEnd(event(190, 140, { pointerId: 8 })));
    expect(result.current.isSelecting).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.selectedNoteIds).toEqual([notes[2].id]);
    expect(result.current.isSelecting).toBe(false);
  });

  it("途中追加を含めず、確定時の現在境界と可視IDで選ぶ", () => {
    const { result, rerender, notes, viewport, event } = setup();
    act(() => result.current.onPointerDown(event(0, 0)));
    const first = viewport.children[0] as HTMLElement;
    first.getBoundingClientRect = () => new DOMRect(400, 50, 80, 80);
    rerender({ currentNotes: notes.slice(0, 2) });
    act(() => result.current.onPointerMove(event(300, 140)));
    act(() => result.current.onPointerEnd(event(300, 140)));
    expect(result.current.selectedNoteIds).toEqual([notes[1].id]);
  });

  it("touch空白は矩形を開始せず、選択だけで前面化しない", () => {
    const { result, event } = setup();
    act(() =>
      result.current.onPointerDown(event(0, 0, { pointerType: "touch" })),
    );
    expect(result.current.isSelecting).toBe(false);
  });
});
