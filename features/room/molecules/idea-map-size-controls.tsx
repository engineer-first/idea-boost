"use client";

import { Info, Minus, Plus } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IDEA_MAP_SIZE_LEVEL_RANGE } from "@/contracts/board";

import { IDEA_MAP_SIZE_HELP } from "../logic/idea-value-feasibility-map";

export type IdeaMapSizeControlsProps = {
  sizeLevel: number;
  initialized: boolean;
  isHost: boolean;
  isDisconnected: boolean;
  isDragging: boolean;
  onResize: (sizeLevel: number) => void;
};

export function IdeaMapSizeControls({
  sizeLevel,
  initialized,
  isHost,
  isDisconnected,
  isDragging,
  onResize,
}: IdeaMapSizeControlsProps): ReactElement {
  const { min, max } = IDEA_MAP_SIZE_LEVEL_RANGE;
  const boundedLevel = Math.min(max, Math.max(min, sizeLevel));
  const disabledReason = !initialized
    ? "初期サイズを準備しています。"
    : isDisconnected
      ? "接続が回復すると変更できます。"
      : isDragging
        ? "付箋のドラッグ中は変更できません。"
        : !isHost
          ? "広さを変更できるのはホストだけです。"
          : null;

  const sizeDescription = `現在の広さは${boundedLevel - min + 1}段階目です（全${max - min + 1}段階）。`;
  const limitDescription =
    boundedLevel <= min
      ? "これ以上狭くできません。"
      : boundedLevel >= max
        ? "これ以上広くできません。"
        : null;

  return (
    <fieldset
      aria-label="2軸マップの広さ操作"
      aria-description={IDEA_MAP_SIZE_HELP.scope}
      className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50/95 p-1.5 shadow-lg shadow-black/5"
      data-testid="idea-map-size-controls"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-2 py-1 text-foreground"
            aria-label="マップの広さについて"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-xs font-semibold">マップの広さ</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                全員に反映
              </span>
            </span>
            <Info aria-hidden="true" className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-72 max-w-[calc(100vw-1.5rem)] space-y-2 text-sm"
          aria-label="マップの広さについて"
        >
          <p className="font-semibold">マップの広さについて</p>
          <p>{IDEA_MAP_SIZE_HELP.scope}</p>
          <p>{IDEA_MAP_SIZE_HELP.camera}</p>
          <p>{IDEA_MAP_SIZE_HELP.direction}</p>
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
        aria-label="マップを狭くする"
        title="マップを狭くする（全員に反映）"
        disabled={disabledReason !== null || boundedLevel <= min}
        onClick={() => onResize(Math.max(min, boundedLevel - 1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="マップを広くする"
        title="マップを広くする（全員に反映）"
        disabled={disabledReason !== null || boundedLevel >= max}
        onClick={() => onResize(Math.min(max, boundedLevel + 1))}
      >
        <Plus aria-hidden="true" />
      </Button>
      <span className="sr-only" role="status">
        {disabledReason ?? `現在の広さは${boundedLevel - min + 1}段階目です。`}
      </span>
    </fieldset>
  );
}
