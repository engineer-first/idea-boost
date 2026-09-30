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
      aria-description="方向キーで視野を移動、PageUp・PageDownで上下に読む。自分だけの表示です"
      title="表示倍率は自分だけ。表示操作にフォーカスして方向キー、またはSpace＋ドラッグで移動"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="キャンバスを縮小"
        title="キャンバスを縮小（自分だけの表示）"
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
        title="ズームを100%に戻す（自分だけの表示）"
        onClick={onResetZoom}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="キャンバスを拡大"
        title="キャンバスを拡大（自分だけの表示）"
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
        title="付箋全体を表示（自分だけの表示）"
        onClick={onFitToNotes}
      >
        <Maximize2 aria-hidden="true" />
      </Button>
    </fieldset>
  );
}
