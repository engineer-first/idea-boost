"use client";

import { Hand, Maximize2, Minus, MousePointer2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CanvasZoomControlsProps = {
  interactionTool?: "select" | "hand";
  onToolChange?: (tool: "select" | "hand") => void;
  toolDisabled?: boolean;
  zoom: number;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onFitToNotes: () => void;
};

export function CanvasZoomControls({
  interactionTool = "select",
  onToolChange,
  toolDisabled = false,
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
      {onToolChange ? (
        <>
          <Button
            type="button"
            variant={interactionTool === "select" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="選択ツール"
            aria-pressed={interactionTool === "select"}
            title="選択（背景でV）"
            disabled={toolDisabled}
            onClick={() => onToolChange("select")}
          >
            <MousePointer2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={interactionTool === "hand" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="手のひらツール"
            aria-pressed={interactionTool === "hand"}
            title="手のひら（背景でH）。Space＋ドラッグで一時的に画面移動"
            disabled={toolDisabled}
            onClick={() => onToolChange("hand")}
          >
            <Hand aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={toolDisabled}
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
        disabled={toolDisabled}
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
        disabled={toolDisabled}
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
        disabled={toolDisabled}
        aria-label="付箋全体を表示"
        title="付箋全体を表示（自分だけの表示）"
        onClick={onFitToNotes}
      >
        <Maximize2 aria-hidden="true" />
      </Button>
      <details
        className="relative"
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            event.nativeEvent.isComposing ||
            !event.currentTarget.open
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }}
      >
        <summary
          aria-label="キャンバス操作のヒント"
          className="flex size-7 cursor-pointer list-none items-center justify-center rounded text-sm font-bold hover:bg-muted focus-visible:outline-2"
        >
          ?
        </summary>
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-background p-3 text-xs leading-relaxed shadow-lg max-[639px]:right-0 max-[639px]:left-auto">
          <p>背景でV：選択、H：手のひら。Space＋ドラッグで画面移動。</p>
          <p>空白を囲んで複数選択。Shift＋クリックで追加・解除。</p>
          <p>
            付箋を選び、もう一度クリックまたはEnterで編集。Escapeは編集・操作・選択の順に1段ずつ終了。
          </p>
          <p>
            マイ付箋の個人作業では、選択した付箋をDeleteで削除。Backspaceは削除しません。
          </p>
        </div>
      </details>
    </fieldset>
  );
}
