"use client";

import { ArrowLeft, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { RoomPhase } from "@/contracts/phase";
import { getPhaseLabel } from "../logic/phase-labels";

export type PhaseRollbackDialogProps = {
  phase: RoomPhase;
  target: RoomPhase;
  disabled: boolean;
  onConfirm: () => void;
};

export function PhaseRollbackDialog({
  phase,
  target,
  disabled,
  onConfirm,
}: PhaseRollbackDialogProps) {
  const [open, setOpen] = useState(false);
  const [finalConfirmation, setFinalConfirmation] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const targetNumber =
    target.kind === "step" ? `${target.phase}-${target.step}` : "開始待ち";
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFinalConfirmation(false);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 justify-start"
          disabled={disabled}
        >
          <Undo2 className="size-4" aria-hidden="true" />
          直前のステップに戻る
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        data-phase-rollback-dialog
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md"
      >
        <AlertDialogHeader className="items-start text-left">
          <AlertDialogTitle>
            {finalConfirmation
              ? "全員の作業を戻しますか？"
              : "直前のステップに戻る"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {finalConfirmation
              ? "この操作は取り消せません。本当に実行しますか？"
              : "次のステップへ進む直前の状態に、全員を戻します。それ以降に全員が操作したものを取り消します。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {finalConfirmation ? (
          <p className="text-sm font-medium">戻り先：{getPhaseLabel(target)}</p>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
            <ArrowLeft
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">
                {getPhaseLabel(phase)} から
              </p>
              <p className="font-semibold">{getPhaseLabel(target)} へ戻る</p>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" ref={cancelRef}>
            キャンセル
          </AlertDialogCancel>
          {finalConfirmation ? (
            <AlertDialogAction
              className="min-h-11"
              disabled={disabled}
              onClick={onConfirm}
              variant="destructive"
            >
              {targetNumber}へ戻る
            </AlertDialogAction>
          ) : (
            <Button
              className="min-h-11"
              type="button"
              disabled={disabled}
              onClick={() => {
                setFinalConfirmation(true);
                cancelRef.current?.focus();
              }}
            >
              {targetNumber}へ戻る
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
