"use client";

import { CheckCircle2, MousePointerClick, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type AdoptionPhaseNumber = 1 | 2 | 3;

export function getAdoptionTargetLabel(phaseNumber: AdoptionPhaseNumber) {
  switch (phaseNumber) {
    case 1:
      return "付箋";
    case 2:
      return "問い";
    case 3:
      return "アイデア";
  }
}

export type AdoptNoteControlProps = {
  phaseNumber: AdoptionPhaseNumber;
  canSelect?: boolean;
  isSelecting: boolean;
  decisionContent: string | null;
  disabled: boolean;
  onStartSelection: () => void;
  onCancelSelection: () => void;
  onClearDecision?: () => void;
  /** 選択中の段で、キャンセルの前に並べるほかの操作（再投票など）。 */
  selectingActions?: ReactNode;
};

export function AdoptNoteControl({
  phaseNumber,
  canSelect = true,
  isSelecting,
  decisionContent,
  disabled,
  onStartSelection,
  onCancelSelection,
  onClearDecision,
  selectingActions,
}: AdoptNoteControlProps) {
  const targetLabel = getAdoptionTargetLabel(phaseNumber);

  if (decisionContent !== null) {
    return (
      <section
        aria-label={`採用する${targetLabel}の確定状態`}
        className="pointer-events-auto flex h-14 max-w-xl items-center gap-3 rounded-xl border border-state-decided/40 bg-background p-1.5 pl-4 shadow-tool"
      >
        <CheckCircle2
          aria-hidden="true"
          className="size-5 shrink-0 text-state-decided-text"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-state-decided-text">
            {targetLabel}を1件確定済み
          </p>
          <p className="truncate text-sm font-medium" title={decisionContent}>
            {decisionContent}
          </p>
        </div>
        {onClearDecision ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 px-3 text-sm"
            disabled={disabled}
            onClick={onClearDecision}
          >
            <Undo2 aria-hidden="true" />
            確定を取り消す
          </Button>
        ) : null}
      </section>
    );
  }

  if (!canSelect) return null;

  if (isSelecting) {
    return (
      <div
        role="status"
        aria-live="polite"
        // 狭い幅では文言の行とボタンの行に折り返し、文言を縦に潰さない。
        className="pointer-events-auto flex min-h-14 max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border-2 border-primary bg-background p-1.5 pl-4 shadow-tool"
      >
        <MousePointerClick aria-hidden="true" className="size-5 shrink-0" />
        <div className="flex-1">
          <p className="whitespace-nowrap text-sm font-semibold">
            採用する{targetLabel}をクリック
          </p>
        </div>
        {selectingActions}
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 text-sm"
          aria-label="選択をキャンセル"
          onClick={onCancelSelection}
        >
          <X aria-hidden="true" />
          キャンセル
        </Button>
      </div>
    );
  }

  return (
    <Button
      className="pointer-events-auto h-10 px-3 text-sm"
      type="button"
      disabled={disabled}
      onClick={onStartSelection}
    >
      <MousePointerClick aria-hidden="true" />
      採用する付箋を選ぶ
    </Button>
  );
}
