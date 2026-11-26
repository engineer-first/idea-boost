"use client";

import { Hand, Maximize2, Minus, MousePointer2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("app.boardCanvas");
  if (!showNavigationControls && !moveHistory) return null;
  return (
    <TooltipProvider>
      <fieldset
        className="board-hud pointer-events-auto relative flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-tool"
        data-testid="canvas-zoom-controls"
        data-sharing-reaction-anchor=""
        aria-label={
          showNavigationControls ? t("canvasControls") : t("moveHistoryControls")
        }
        aria-description={
          showNavigationControls
            ? onToolChange
              ? t("navigationDescription")
              : t("zoomDescription")
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
                  aria-label={t("selectTool")}
                  className={toolMotion.button}
                  aria-pressed={interactionTool === "select"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("select")}
                >
                  <MousePointer2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("selectToolHint")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={interactionTool === "hand" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={t("handTool")}
                  className={toolMotion.button}
                  aria-pressed={interactionTool === "hand"}
                  disabled={toolDisabled}
                  onClick={() => onToolChange("hand")}
                >
                  <Hand aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("handToolHint")}
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
                  aria-label={t("zoomOut")}
                  className={toolMotion.button}
                  onClick={onZoomOut}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("zoomOutHint")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`${toolMotion.button} min-w-14 tabular-nums`}
                  disabled={toolDisabled}
                  aria-label={t("resetZoom")}
                  onClick={onResetZoom}
                >
                  {Math.round(zoom * 100)}%
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("resetZoomHint")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toolDisabled || zoom >= 4}
                  aria-label={t("zoomIn")}
                  className={toolMotion.button}
                  onClick={onZoomIn}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("zoomInHint")}
              </TooltipContent>
            </Tooltip>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toolDisabled}
                  aria-label={t("fitToNotes")}
                  className={toolMotion.button}
                  onClick={onFitToNotes}
                >
                  <Maximize2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("fitToNotesHint")}
              </TooltipContent>
            </Tooltip>
            {reactionControls?.(toolDisabled)}
          </div>
        ) : null}
      </fieldset>
    </TooltipProvider>
  );
}
