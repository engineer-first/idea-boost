"use client";

import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { Note } from "@/features/notes";

export type CanvasTool = "select" | "hand";
export type CanvasSelectionOptions = {
  shiftKey?: boolean;
  bringToFront?: boolean;
};
export type CanvasMarquee = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type SelectionPress = {
  pointerId: number;
  x: number;
  y: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  before: string[];
  candidates: string[];
  didDrag: boolean;
};

export function useCanvasSelection({
  viewportRef,
  notes,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  notes: Note[];
}) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [marquee, setMarquee] = useState<CanvasMarquee | null>(null);
  const selectionRef = useRef(selectedNoteIds);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const pressRef = useRef<SelectionPress | null>(null);
  const updateSelection = useCallback((ids: string[]) => {
    if (
      selectionRef.current.length === ids.length &&
      selectionRef.current.every((id, index) => id === ids[index])
    )
      return;
    selectionRef.current = ids;
    setSelectedNoteIds(ids);
  }, []);

  useEffect(() => {
    const visible = new Set(notes.map(({ id }) => id));
    const next = selectionRef.current.filter((id) => visible.has(id));
    if (next.length !== selectionRef.current.length) updateSelection(next);
  }, [notes, updateSelection]);

  const selectNote = useCallback(
    (noteId: string | null, options: CanvasSelectionOptions = {}) => {
      if (noteId === null) {
        updateSelection([]);
        return;
      }
      const note = notesRef.current.find(({ id }) => id === noteId);
      if (!note) return;
      const sameSurface = selectionRef.current.filter(
        (id) =>
          notesRef.current.find((item) => item.id === id)?.visibility ===
          note.visibility,
      );
      if (options.shiftKey && note.visibility === "shared") {
        updateSelection(
          sameSurface.includes(noteId)
            ? sameSurface.filter((id) => id !== noteId)
            : [...sameSurface, noteId],
        );
      } else updateSelection([noteId]);
    },
    [updateSelection],
  );

  const release = useCallback(
    (pointerId: number) => {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture?.(pointerId))
        viewport.releasePointerCapture(pointerId);
    },
    [viewportRef],
  );

  const cancel = useCallback(() => {
    const press = pressRef.current;
    if (!press) return false;
    pressRef.current = null;
    const visible = new Set(notesRef.current.map(({ id }) => id));
    updateSelection(press.before.filter((id) => visible.has(id)));
    setMarquee(null);
    setIsSelecting(false);
    release(press.pointerId);
    return true;
  }, [release, updateSelection]);

  const computeSelection = useCallback(
    (press: SelectionPress) => {
      const left = Math.min(press.x, press.currentX);
      const right = Math.max(press.x, press.currentX);
      const top = Math.min(press.y, press.currentY);
      const bottom = Math.max(press.y, press.currentY);
      const visible = new Set(
        notesRef.current
          .filter((note) => note.visibility === "shared")
          .map(({ id }) => id),
      );
      const hits: string[] = [];
      for (const element of viewportRef.current?.querySelectorAll<HTMLElement>(
        "[data-testid='note-card'][data-note-id]",
      ) ?? []) {
        const id = element.dataset.noteId;
        if (!id || !visible.has(id) || !press.candidates.includes(id)) continue;
        const rect = element.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right >= left &&
          rect.left <= right &&
          rect.bottom >= top &&
          rect.top <= bottom
        )
          hits.push(id);
      }
      return [
        ...new Set([
          ...(press.additive
            ? press.before.filter((id) => visible.has(id))
            : []),
          ...hits,
        ]),
      ];
    },
    [viewportRef],
  );

  function onPointerDown(event: PointerEvent<HTMLDivElement>): boolean {
    if (
      pressRef.current ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      event.isPrimary === false
    )
      return false;
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !(
        target === event.currentTarget ||
        target.dataset.canvasBackground === "true"
      )
    )
      return false;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsSelecting(true);
    pressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: event.shiftKey,
      before: [...selectionRef.current],
      candidates: notesRef.current
        .filter((note) => note.visibility === "shared")
        .map(({ id }) => id),
      didDrag: false,
    };
    return true;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): boolean {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return false;
    if (event.buttons === 0) {
      cancel();
      return true;
    }
    press.currentX = event.clientX;
    press.currentY = event.clientY;
    press.didDrag ||=
      Math.hypot(press.currentX - press.x, press.currentY - press.y) >=
      DRAG_THRESHOLD_PX;
    if (press.didDrag) {
      const rect = viewportRef.current?.getBoundingClientRect();
      setMarquee({
        left: Math.min(press.x, press.currentX) - (rect?.left ?? 0),
        top: Math.min(press.y, press.currentY) - (rect?.top ?? 0),
        width: Math.abs(press.currentX - press.x),
        height: Math.abs(press.currentY - press.y),
      });
      updateSelection(computeSelection(press));
    }
    return true;
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>): boolean {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return false;
    press.currentX = event.clientX;
    press.currentY = event.clientY;
    updateSelection(press.didDrag ? computeSelection(press) : []);
    pressRef.current = null;
    setMarquee(null);
    setIsSelecting(false);
    release(event.pointerId);
    return true;
  }

  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [cancel]);

  return {
    selectedNoteIds,
    selectionRef,
    selectNote,
    marquee,
    isSelecting,
    hasPointer: (pointerId: number) =>
      pressRef.current?.pointerId === pointerId,
    hasGesture: () => pressRef.current !== null,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    cancel,
  };
}
