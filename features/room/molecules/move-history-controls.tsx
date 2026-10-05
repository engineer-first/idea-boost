"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";

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
    <fieldset
      className="pointer-events-auto flex flex-col gap-1 rounded-xl border bg-background p-1.5"
      aria-label="付箋の移動履歴"
      aria-busy={pending}
    >
      <p className="sr-only">
        本人の付箋移動だけを元に戻します。本文編集中は通常の文字入力の取り消しです。
      </p>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || undo.disabled}
          onClick={onUndo}
          aria-label="移動を元に戻す"
          aria-describedby={`${id}-undo`}
          title={`${undo.label}。${undo.reason ?? ""} Ctrl / Cmd + Z`}
        >
          <Undo2 className="size-4" aria-hidden="true" />
          移動を元に戻す
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || redo.disabled}
          onClick={onRedo}
          aria-label="移動をやり直す"
          aria-describedby={`${id}-redo`}
          title={`${redo.label}。${redo.reason ?? ""} Ctrl / Cmd + Shift + Z`}
        >
          <Redo2 className="size-4" aria-hidden="true" />
          移動をやり直す
        </Button>
      </div>
      <span id={`${id}-undo`} className="sr-only">
        {undo.label}。{undo.reason}。Ctrl / Cmd + Z
      </span>
      <span id={`${id}-redo`} className="sr-only">
        {redo.label}。{redo.reason}。Ctrl / Cmd + Shift + Z
      </span>
      <p className="px-1 text-xs text-muted-foreground">
        Ctrl / Cmd + Z・Shiftでやり直す
      </p>
      {pending ? (
        <span role="status" className="px-1 text-xs text-muted-foreground">
          移動を反映しています…
        </span>
      ) : null}
      {!pending && undo.disabled && undo.reason ? (
        <span className="max-w-64 px-1 text-xs text-muted-foreground">
          {undo.reason}
        </span>
      ) : null}
      {!pending &&
      redo.disabled &&
      redo.reason &&
      redo.reason !== undo.reason ? (
        <span className="max-w-64 px-1 text-xs text-muted-foreground">
          {redo.reason}
        </span>
      ) : null}
    </fieldset>
  );
}
