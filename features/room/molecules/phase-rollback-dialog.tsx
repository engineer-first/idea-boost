"use client";

import { Undo2 } from "lucide-react";
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
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>
            {finalConfirmation
              ? "全員の作業を戻しますか？"
              : "直前のステップに戻る"}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {finalConfirmation ? (
              <>
                この操作は取り消せません。
                <br />
                本当に実行しますか？
              </>
            ) : (
              <>
                次のステップへ進む直前の状態に、全員を戻します。
                <br />
                それ以降に全員が操作したものを
                <span className="whitespace-nowrap">
                  <strong className="font-semibold text-foreground">
                    取り消します
                  </strong>
                  。
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
          {!finalConfirmation && (
            <>
              <dt className="text-muted-foreground">現在</dt>
              <dd className="text-muted-foreground">{getPhaseLabel(phase)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">戻り先</dt>
          <dd className="font-semibold">{getPhaseLabel(target)}</dd>
        </dl>
        <AlertDialogFooter className="mx-0 mb-0 mt-2 rounded-none border-0 bg-transparent p-0">
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
