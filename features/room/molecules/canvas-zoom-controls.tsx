"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CanvasZoomControlsProps = {
  zoom: number;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onFitToNotes: () => void;
};

export function CanvasZoomControls({
  zoom,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onFitToNotes,
}: CanvasZoomControlsProps) {
  return (
    <fieldset
      className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-lg shadow-black/5"
      data-testid="canvas-zoom-controls"
      aria-label="キャンバス表示操作"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="キャンバスを縮小"
        onClick={onZoomOut}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-w-14 tabular-nums"
        aria-label="ズームを100%に戻す"
        onClick={onResetZoom}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="キャンバスを拡大"
        onClick={onZoomIn}
      >
        <Plus aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="付箋全体を表示"
        onClick={onFitToNotes}
      >
        <Maximize2 aria-hidden="true" />
      </Button>
    </fieldset>
  );
}
