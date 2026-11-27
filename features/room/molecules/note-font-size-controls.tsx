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
  hasSelection?: boolean;
  canDecrease?: boolean;
  canIncrease?: boolean;
  disabled: boolean;
  onChange: (fontSize: number) => void;
  onStep?: (delta: number) => void;
};

export function NoteFontSizeControls({
  fontSize,
  hasSelection: hasSelectionProp,
  canDecrease: canDecreaseProp,
  canIncrease: canIncreaseProp,
  disabled,
  onChange,
  onStep,
}: NoteFontSizeControlsProps) {
  const t = useTranslations("app.boardNoteFontSize");
  const hasSelection = hasSelectionProp ?? fontSize !== null;
  const canDecrease =
    canDecreaseProp ??
    (fontSize !== null && fontSize > NOTE_FONT_SIZE_RANGE.min);
  const canIncrease =
    canIncreaseProp ??
    (fontSize !== null && fontSize < NOTE_FONT_SIZE_RANGE.max);
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
          disabled={disabled || !hasSelection || !canDecrease}
          onClick={() => {
            if (onStep) {
              onStep(-NOTE_FONT_SIZE_RANGE.step);
            } else if (fontSize !== null) {
              onChange(fontSize - NOTE_FONT_SIZE_RANGE.step);
            }
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
          disabled={disabled || !hasSelection || !canIncrease}
          onClick={() => {
            if (onStep) {
              onStep(NOTE_FONT_SIZE_RANGE.step);
            } else if (fontSize !== null) {
              onChange(fontSize + NOTE_FONT_SIZE_RANGE.step);
            }
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
