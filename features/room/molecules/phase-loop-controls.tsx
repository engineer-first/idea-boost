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
  isHost: boolean;
  isSelecting: boolean;
  decisionContent: string | null;
  candidateCount: number;
  disabled: boolean;
  onRestartWriting: () => void;
  onRevote: () => void;
  onStartSelection: () => void;
  onCancelSelection: () => void;
};

export function PhaseLoopControls({
  phase,
  isHost,
  isSelecting,
  decisionContent,
  candidateCount,
  disabled,
  onRestartWriting,
  onRevote,
  onStartSelection,
  onCancelSelection,
}: PhaseLoopControlsProps) {
  const [dialog, setDialog] = useState<"writing" | "revote" | null>(null);
  if (phase.kind !== "step") return null;
  const isResult = isResultStep(phase);
  const canRestart = isRestartWritingAllowedStep(phase);
  if (!isResult && (!canRestart || !isHost)) return null;
  if (decisionContent !== null)
    return (
      <AdoptNoteControl
        phaseNumber={phase.phase}
        isHost={isHost}
        isSelecting={false}
        decisionContent={decisionContent}
        disabled={disabled}
        onStartSelection={onStartSelection}
        onCancelSelection={onCancelSelection}
      />
    );
  if (!isHost)
    return isResult ? (
      <p
        role="status"
        className="pointer-events-auto max-w-lg rounded-xl border bg-background px-4 py-3 text-sm shadow-sm"
      >
        {candidateCount === 0
          ? "候補がありません。ホストが付箋を候補に戻すまでお待ちください。"
          : "候補を動かして話し合いましょう。採用はホストが確定します。"}
      </p>
    ) : null;
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {isResult && candidateCount === 0 ? (
        <p
          role="status"
          className="rounded-xl border bg-background px-4 py-2 text-sm"
        >
          候補がありません。薄く表示された付箋のメニューから「候補に戻す」を選んでください。
        </p>
      ) : null}
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-background p-2 shadow-lg shadow-black/5">
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
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {dialog === "writing"
                    ? "もう少し考えるために、個人作業へ戻りますか？"
                    : `候補${candidateCount}件に投票し直しますか？`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {dialog === "writing"
                    ? "全員がこのフェーズの個人作業へ戻り、タイマーは停止します。共有済み付箋と下書きは残ります。共有済み付箋は閲覧のみです。下書きは本人が共有するまで他の人には見えません。"
                    : "付箋は消えません。本文・作者・色・位置・グループ・候補の状態は残ります。このフェーズの前回の票だけを、候補外の付箋への票も含めて消します。前回結果には戻せません。タイマーを停止し、全員が主観1票・客観3票から投票し直します。"}
                </AlertDialogDescription>
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
            isHost
            isSelecting={isSelecting}
            decisionContent={null}
            disabled={disabled || candidateCount === 0}
            onStartSelection={onStartSelection}
            onCancelSelection={onCancelSelection}
          />
        ) : null}
      </div>
    </div>
  );
}
