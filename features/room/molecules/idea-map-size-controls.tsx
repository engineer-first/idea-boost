"use client";

import { Info, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IDEA_MAP_SIZE_LEVEL_RANGE } from "@/contracts/board";

export type IdeaMapSizeControlsProps = {
  sizeLevel: number;
  initialized: boolean;
  isDisconnected: boolean;
  isDragging: boolean;
  onResize: (sizeLevel: number) => void;
};

export function IdeaMapSizeControls({
  sizeLevel,
  initialized,
  isDisconnected,
  isDragging,
  onResize,
}: IdeaMapSizeControlsProps): ReactElement | null {
  const t = useTranslations("app.boardMapSize");
  const { min, max } = IDEA_MAP_SIZE_LEVEL_RANGE;
  const boundedLevel = Math.min(max, Math.max(min, sizeLevel));
  const disabledReason = !initialized
    ? t("disabledPreparing")
    : isDisconnected
      ? t("disabledDisconnected")
      : isDragging
        ? t("disabledDragging")
        : null;

  const sizeDescription = t("sizeDescription", {
    level: boundedLevel - min + 1,
    total: max - min + 1,
  });
  const limitDescription =
    boundedLevel <= min
      ? t("limitNarrow")
      : boundedLevel >= max
        ? t("limitWide")
        : null;

  return (
    <fieldset
      aria-label={t("ariaLabel")}
      aria-description={t("scope")}
      className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-primary-soft/95 p-1.5 shadow-tool"
      data-testid="idea-map-size-controls"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-2 py-1 text-foreground max-[639px]:px-1"
            aria-label={t("helpLabel")}
          >
            <span
              className="flex flex-col items-start gap-0.5 max-[639px]:sr-only"
              data-map-size-label
            >
              <span className="text-xs font-semibold">{t("label")}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t("shared")}
              </span>
            </span>
            <Info aria-hidden="true" className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-72 max-w-[calc(100vw-1.5rem)] space-y-2 text-base"
          aria-label={t("helpLabel")}
        >
          <p className="font-semibold">{t("helpTitle")}</p>
          <p>{t("scope")}</p>
          <p>{t("camera")}</p>
          <p>{t("direction")}</p>
          <p className="text-muted-foreground">{sizeDescription}</p>
          {disabledReason || limitDescription ? (
            <p role="status">{disabledReason ?? limitDescription}</p>
          ) : null}
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("decreaseLabel")}
        title={t("decreaseTitle")}
        disabled={disabledReason !== null || boundedLevel <= min}
        onClick={() => onResize(Math.max(min, boundedLevel - 1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("increaseLabel")}
        title={t("increaseTitle")}
        disabled={disabledReason !== null || boundedLevel >= max}
        onClick={() => onResize(Math.min(max, boundedLevel + 1))}
      >
        <Plus aria-hidden="true" />
      </Button>
      <span className="sr-only" role="status">
        {disabledReason ?? t("currentSize", { level: boundedLevel - min + 1 })}
      </span>
    </fieldset>
  );
}
