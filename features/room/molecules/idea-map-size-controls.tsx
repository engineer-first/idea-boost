"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IDEA_MAP_SIZE_LEVEL_RANGE } from "@/contracts/board";

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
}: IdeaMapSizeControlsProps) {
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

  return (
    <fieldset
      aria-label="2軸マップの広さ操作"
      className="board-hud pointer-events-auto flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50/95 p-1.5 shadow-lg shadow-black/5 dark:border-sky-900 dark:bg-slate-950/95"
      data-testid="idea-map-size-controls"
    >
      <span className="px-2 text-xs font-semibold text-foreground">
        マップの広さ
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="マップを狭くする"
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
