"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NOTE_FONT_SIZE_RANGE } from "@/contracts/board";

export type NoteFontSizeControlsProps = {
  fontSize: number | null;
  disabled: boolean;
  onChange: (fontSize: number) => void;
};

export function NoteFontSizeControls({
  fontSize,
  disabled,
  onChange,
}: NoteFontSizeControlsProps) {
  const hasSelection = fontSize !== null;
  return (
    <TooltipProvider>
      <fieldset
        className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-tool"
        data-testid="note-font-size-controls"
        aria-label="選択した付箋の文字サイズ"
        aria-description="共有した付箋は全員の表示に反映されます"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={
                disabled ||
                !hasSelection ||
                fontSize <= NOTE_FONT_SIZE_RANGE.min
              }
              aria-label="付箋の文字を小さく"
              onClick={() => {
                if (fontSize !== null)
                  onChange(fontSize - NOTE_FONT_SIZE_RANGE.step);
              }}
            >
              <span aria-hidden="true" className="text-xs font-bold">
                A−
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">選んだ付箋の文字を小さく</TooltipContent>
        </Tooltip>
        <span
          className="min-w-12 text-center text-xs font-semibold tabular-nums"
          aria-live="polite"
        >
          {fontSize === null ? "--px" : `${fontSize}px`}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={
                disabled ||
                !hasSelection ||
                fontSize >= NOTE_FONT_SIZE_RANGE.max
              }
              aria-label="付箋の文字を大きく"
              onClick={() => {
                if (fontSize !== null)
                  onChange(fontSize + NOTE_FONT_SIZE_RANGE.step);
              }}
            >
              <span aria-hidden="true" className="text-sm font-bold">
                A＋
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">選んだ付箋の文字を大きく</TooltipContent>
        </Tooltip>
      </fieldset>
    </TooltipProvider>
  );
}
