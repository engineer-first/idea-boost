"use client";

import { useState } from "react";
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
import {
  isRestartWritingAllowedStep,
  isResultStep,
  type RoomPhase,
} from "@/contracts/phase";
import { AdoptNoteControl } from "./adopt-note-control";

export type PhaseLoopControlsProps = {
  phase: RoomPhase;
  isSelecting: boolean;
  decisionContent: string | null;
  candidateCount: number;
  disabled: boolean;
  selectionDisabled?: boolean;
  onRestartWriting: () => void;
  onRevote: () => void;
  onStartSelection: () => void;
  onCancelSelection: () => void;
  onClearDecision?: () => void;
};

export function PhaseLoopControls({
  phase,
  isSelecting,
  decisionContent,
  candidateCount,
  disabled,
  selectionDisabled = false,
  onRestartWriting,
  onRevote,
  onStartSelection,
  onCancelSelection,
  onClearDecision,
}: PhaseLoopControlsProps) {
  const [dialog, setDialog] = useState<"writing" | "revote" | null>(null);
  if (phase.kind !== "step") return null;
  const isResult = isResultStep(phase);
  const canRestart = isRestartWritingAllowedStep(phase);
  if (!isResult && !canRestart) return null;
  if (decisionContent !== null)
    return (
      <AdoptNoteControl
        phaseNumber={phase.phase}
        canSelect
        isSelecting={false}
        decisionContent={decisionContent}
        disabled={disabled || selectionDisabled}
        onStartSelection={onStartSelection}
        onCancelSelection={onCancelSelection}
        onClearDecision={isResult ? onClearDecision : undefined}
      />
    );
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {isResult && candidateCount === 0 ? (
        <p
          role="status"
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          候補がありません。薄く表示された付箋のメニューから「候補に戻す」を選んでください。
        </p>
      ) : null}
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-background p-2 shadow-tool">
        {!isSelecting ? (
          <AlertDialog
            open={dialog !== null}
            onOpenChange={(open) =>
              setDialog(open ? (canRestart ? "writing" : "revote") : null)
            }
          >
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || (isResult && candidateCount === 0)}
              >
                {canRestart ? "もう一度付箋を書く" : "もう一度投票する"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              aria-describedby={
                dialog === "writing" ? undefined : "revote-description"
              }
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {dialog === "writing"
                    ? "もう少し考えるために、個人作業へ戻りますか？"
                    : `候補${candidateCount}件に投票し直しますか？`}
                </AlertDialogTitle>
                {dialog === "revote" && (
                  <AlertDialogDescription id="revote-description">
                    付箋は消えません。
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  disabled={disabled || (isResult && candidateCount === 0)}
                  onClick={dialog === "writing" ? onRestartWriting : onRevote}
                >
                  {dialog === "writing"
                    ? "個人作業へ戻る"
                    : "前回の票を消して始める"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {isResult ? (
          <AdoptNoteControl
            phaseNumber={phase.phase}
            canSelect={isResult}
            isSelecting={isSelecting}
            decisionContent={null}
            disabled={disabled || selectionDisabled || candidateCount === 0}
            onStartSelection={onStartSelection}
            onCancelSelection={onCancelSelection}
          />
        ) : null}
      </div>
    </div>
  );
}
