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
import { isResultStep, type RoomPhase } from "@/contracts/phase";
import { AdoptNoteControl } from "./adopt-note-control";

export type PhaseLoopControlsProps = {
  phase: RoomPhase;
  isSelecting: boolean;
  decisionContent: string | null;
  candidateCount: number;
  disabled: boolean;
  selectionDisabled?: boolean;
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
  onRevote,
  onStartSelection,
  onCancelSelection,
  onClearDecision,
}: PhaseLoopControlsProps) {
  const [revoteOpen, setRevoteOpen] = useState(false);
  if (phase.kind !== "step" || !isResultStep(phase)) return null;
  const revoteControl = (
    <AlertDialog open={revoteOpen} onOpenChange={setRevoteOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 text-sm"
          disabled={disabled || candidateCount === 0}
        >
          もう一度投票する
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent aria-describedby="revote-description">
        <AlertDialogHeader>
          <AlertDialogTitle>
            候補{candidateCount}件に投票し直しますか？
          </AlertDialogTitle>
          <AlertDialogDescription id="revote-description">
            付箋は消えません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || candidateCount === 0}
            onClick={onRevote}
          >
            前回の票を消して始める
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  // 確定済みと選択中は、それぞれ自分の段を持つので外枠で包まない。
  // 決定ステップは最初から選択中なので、選択中の段にも再投票を並べる。
  if (decisionContent !== null || isSelecting)
    return (
      <AdoptNoteControl
        phaseNumber={phase.phase}
        canSelect
        isSelecting={isSelecting}
        decisionContent={decisionContent}
        disabled={disabled || selectionDisabled}
        onStartSelection={onStartSelection}
        onCancelSelection={onCancelSelection}
        onClearDecision={onClearDecision}
        selectingActions={revoteControl}
      />
    );
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {candidateCount === 0 ? (
        <p
          role="status"
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          候補がありません。薄く表示された付箋のメニューから「除外を戻す」を選んでください。
        </p>
      ) : null}
      {/* 上部の操作欄（board HUD）と同じ高さ・角丸・影・ボタンの高さにそろえる。 */}
      <div className="pointer-events-auto flex min-h-14 max-w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-1.5 shadow-tool">
        {revoteControl}
        <AdoptNoteControl
          phaseNumber={phase.phase}
          canSelect
          isSelecting={false}
          decisionContent={null}
          disabled={disabled || selectionDisabled || candidateCount === 0}
          onStartSelection={onStartSelection}
          onCancelSelection={onCancelSelection}
        />
      </div>
    </div>
  );
}
