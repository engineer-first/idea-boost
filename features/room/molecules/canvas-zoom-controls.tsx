"use client";

import { Hand, Maximize2, Minus, MousePointer2, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import toolMotion from "@/components/ui/tool-motion.module.css";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoveHistoryControls,
  type MoveHistoryControlsProps,
} from "./move-history-controls";

export type CanvasZoomControlsProps = {
  reactionControls?: (disabled: boolean) => ReactNode;
  moveHistory?: MoveHistoryControlsProps;
  showNavigationControls?: boolean;
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
  reactionControls,
  moveHistory,
  showNavigationControls = true,
  interactionTool = "select",
  onToolChange,
  toolDisabled = false,
  zoom,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onFitToNotes,
}: CanvasZoomControlsProps) {
  if (!showNavigationControls && !moveHistory) return null;
  return (
    <TooltipProvider>
      <fieldset
        className="board-hud pointer-events-auto relative flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-tool"
        data-testid="canvas-zoom-controls"
        data-sharing-reaction-anchor=""
        aria-label={
          showNavigationControls ? "キャンバス表示操作" : "付箋の移動履歴"
        }
        aria-description={
          showNavigationControls
            ? onToolChange
              ? "方向キーで視野を移動、PageUp・PageDownで上下に読む。視野とズームの変更は自分だけの表示です"
              : "ズームの変更は自分だけの表示です"
            : undefined
        }
      >
        {showNavigationControls && onToolChange ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={interactionTool === "select" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="選択ツール"
                  className={toolMotion.button}
                  aria-pressed={interactionTool === "select"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("select")}
                >
                  <MousePointer2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">選択（V）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={interactionTool === "hand" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="手のひらツール"
                  className={toolMotion.button}
                  aria-pressed={interactionTool === "hand"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("hand")}
                >
                  <Hand aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                手のひら（H / Space＋ドラッグ）
              </TooltipContent>
            </Tooltip>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          </>
        ) : null}
        {moveHistory ? (
          <>
            <MoveHistoryControls {...moveHistory} />
            <span
              aria-hidden="true"
              className="mx-0.5 h-5 w-px bg-border max-[399px]:hidden"
            />
          </>
        ) : null}
        {showNavigationControls ? (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toolDisabled || zoom <= 0.01}
                  aria-label="キャンバスを縮小"
                  className={toolMotion.button}
                  onClick={onZoomOut}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">縮小</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`${toolMotion.button} min-w-14 tabular-nums`}
                  disabled={toolDisabled}
                  aria-label="ズームを100%に戻す"
                  onClick={onResetZoom}
                >
                  {Math.round(zoom * 100)}%
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">100%に戻す</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toolDisabled || zoom >= 4}
                  aria-label="キャンバスを拡大"
                  className={toolMotion.button}
                  onClick={onZoomIn}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">拡大</TooltipContent>
            </Tooltip>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toolDisabled}
                  aria-label="付箋全体を表示"
                  className={toolMotion.button}
                  onClick={onFitToNotes}
                >
                  <Maximize2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">全体を表示</TooltipContent>
            </Tooltip>
            {reactionControls?.(toolDisabled)}
          </div>
        ) : null}
      </fieldset>
    </TooltipProvider>
  );
}
