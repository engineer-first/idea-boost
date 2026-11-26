"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
  const t = useTranslations("app.boardNoteFontSize");
  const hasSelection = fontSize !== null;
  return (
    <TooltipProvider>
      <fieldset
        className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-tool"
        data-testid="note-font-size-controls"
        aria-label={t("ariaLabel")}
        aria-description={t("ariaDescription")}
      >
        <FontSizeButton
          label={t("decreaseLabel")}
          hint={t("decreaseHint")}
          disabled={
            disabled || !hasSelection || fontSize <= NOTE_FONT_SIZE_RANGE.min
          }
          onClick={() => {
            if (fontSize !== null)
              onChange(fontSize - NOTE_FONT_SIZE_RANGE.step);
          }}
        >
          <span aria-hidden="true" className="text-xs font-bold">
            A−
          </span>
        </FontSizeButton>
        <span
          className="min-w-12 text-center text-xs font-semibold tabular-nums"
          aria-live="polite"
        >
          {fontSize === null ? "--px" : `${fontSize}px`}
        </span>
        <FontSizeButton
          label={t("increaseLabel")}
          hint={t("increaseHint")}
          disabled={
            disabled || !hasSelection || fontSize >= NOTE_FONT_SIZE_RANGE.max
          }
          onClick={() => {
            if (fontSize !== null)
              onChange(fontSize + NOTE_FONT_SIZE_RANGE.step);
          }}
        >
          <span aria-hidden="true" className="text-sm font-bold">
            A＋
          </span>
        </FontSizeButton>
      </fieldset>
    </TooltipProvider>
  );
}

function FontSizeButton({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      {/* 押せないボタンはポインター操作を受けないため、包んだ要素でホバーを拾う。 */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={label}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}
