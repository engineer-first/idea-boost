"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type MoveHistoryAction = {
  label: string;
  reason: string | null;
  disabled: boolean;
};

export type MoveHistoryControlsProps = {
  undo: MoveHistoryAction;
  redo: MoveHistoryAction;
  pending: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function MoveHistoryControls({
  undo,
  redo,
  pending,
  onUndo,
  onRedo,
}: MoveHistoryControlsProps) {
  const id = useId();
  return (
    <TooltipProvider delayDuration={1000}>
      <fieldset
        className="pointer-events-auto flex min-w-0 shrink-0 items-center gap-1"
        aria-label="付箋の移動履歴"
        aria-busy={pending}
      >
        <p className="sr-only">
          本人の付箋移動だけを元に戻します。本文編集中は通常の文字入力の取り消しです。
        </p>
        {(
          [
            {
              action: undo,
              name: "移動を元に戻す",
              shortcut: "Ctrl / Cmd + Z",
              onClick: onUndo,
              Icon: Undo2,
              direction: "undo",
            },
            {
              action: redo,
              name: "移動をやり直す",
              shortcut: "Ctrl / Cmd + Shift + Z",
              onClick: onRedo,
              Icon: Redo2,
              direction: "redo",
            },
          ] as const
        ).map(({ action, name, shortcut, onClick, Icon, direction }) => {
          const disabled = pending || action.disabled;
          const description = `${name}（${shortcut}）。${action.label}。${pending ? "移動を反映しています…" : (action.reason ?? "")}`;
          return (
            <Tooltip key={direction}>
              <TooltipTrigger asChild>
                <fieldset
                  tabIndex={disabled ? 0 : undefined}
                  aria-label={disabled ? name : undefined}
                  aria-describedby={disabled ? `${id}-${direction}` : undefined}
                  className="inline-flex min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={onClick}
                    aria-label={name}
                    aria-describedby={`${id}-${direction}`}
                  >
                    <Icon aria-hidden="true" />
                  </Button>
                </fieldset>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64">
                {description}
              </TooltipContent>
              <span id={`${id}-${direction}`} className="sr-only">
                {description}
              </span>
            </Tooltip>
          );
        })}
        {pending ? (
          <span role="status" className="sr-only">
            移動を反映しています…
          </span>
        ) : null}
      </fieldset>
    </TooltipProvider>
  );
}
