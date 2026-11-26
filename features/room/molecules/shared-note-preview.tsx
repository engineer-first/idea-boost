"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { Note } from "@/features/notes";
import {
  placeSharedNotePreview,
  type SharedNotePreviewPlacement,
} from "../logic/shared-note-preview-placement";

export type SharedNotePreviewProps = {
  note: Note;
  anchor: HTMLElement | null;
  viewport: HTMLElement | null;
  panel: HTMLElement | null;
  layoutKey: string;
  onClose: () => void;
};

export function SharedNotePreview({
  note,
  anchor,
  viewport,
  panel,
  layoutKey,
  onClose,
}: SharedNotePreviewProps) {
  const t = useTranslations("app.boardCanvas");
  const [placement, setPlacement] = useState<SharedNotePreviewPlacement | null>(
    null,
  );
  const popupRef = useRef<HTMLElement>(null);
  const currentLayoutRef = useRef(layoutKey);
  useLayoutEffect(() => {
    currentLayoutRef.current = layoutKey;
    const update = (): void => {
      if (currentLayoutRef.current !== layoutKey) return;
      if (!anchor || !viewport) {
        onClose();
        return;
      }
      const viewportBounds = viewport.getBoundingClientRect();
      if (viewportBounds.width === 0 || viewportBounds.height === 0) return;
      const board = viewport.closest<HTMLElement>(
        '[data-testid="room-board-view-root"]',
      );
      // RoomBoardView が画面座標で保存するため、ボード上端は足さない。
      const expandedTop = board
        ? Number.parseFloat(
            getComputedStyle(board).getPropertyValue(
              "--board-private-expanded-top",
            ),
          )
        : Number.NaN;
      const headerBottom = Number.isFinite(expandedTop)
        ? expandedTop
        : viewportBounds.top;
      const next = placeSharedNotePreview(
        anchor.getBoundingClientRect(),
        {
          left: viewportBounds.left,
          right: viewportBounds.right,
          bottom: viewportBounds.bottom,
          top: Math.max(viewportBounds.top, headerBottom),
        },
        panel?.getBoundingClientRect() ?? null,
      );
      if (!next) {
        onClose();
        return;
      }
      setPlacement((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    update();
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (viewport) resize?.observe(viewport);
    if (panel) resize?.observe(panel);
    window.addEventListener("resize", update);
    return () => {
      resize?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [anchor, viewport, panel, onClose, layoutKey]);
  useEffect(() => {
    const pointer = (event: PointerEvent): void => {
      if (
        event.target instanceof Element &&
        viewport?.contains(event.target) &&
        !event.target.closest("[data-testid='note-card']") &&
        !popupRef.current?.contains(event.target)
      )
        onClose();
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229)
        onClose();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key, true);
    };
  }, [viewport, onClose]);
  if (!placement) return null;
  return createPortal(
    <section
      ref={popupRef}
      aria-label={t("sharedNoteContentAria")}
      data-cursor-private="true"
      className="fixed z-[41] flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-tool"
      style={{
        left: placement.left,
        top: placement.top,
        width: placement.width,
        maxHeight: placement.height,
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">{t("sharedNoteReadOnly")}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("closeSharedNoteContent")}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <p className="min-h-0 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words p-3 text-base">
        {note.content || t("noSharedNoteBody")}
      </p>
    </section>,
    document.body,
  );
}
