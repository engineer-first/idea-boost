"use client";

import { CheckCircle2, MousePointerClick, X } from "lucide-react";
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
  isHost: boolean;
  isSelecting: boolean;
  decisionContent: string | null;
  disabled: boolean;
  onStartSelection: () => void;
  onCancelSelection: () => void;
};

export function AdoptNoteControl({
  phaseNumber,
  isHost,
  isSelecting,
  decisionContent,
  disabled,
  onStartSelection,
  onCancelSelection,
}: AdoptNoteControlProps) {
  const targetLabel = getAdoptionTargetLabel(phaseNumber);

  if (isSelecting && isHost) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border-2 border-primary bg-background px-4 py-3 shadow-lg shadow-black/5"
      >
        <MousePointerClick aria-hidden="true" className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            採用する{targetLabel}をクリックしてください
          </p>
          {decisionContent !== null ? (
            <p className="truncate text-sm font-medium" title={decisionContent}>
              選択中: {decisionContent}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            別の候補をクリックすると切り替わります。Escape
            で選択モードを終了できます。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label="選択モードを終了"
          onClick={onCancelSelection}
        >
          <X aria-hidden="true" />
          終了
        </Button>
      </div>
    );
  }

  if (decisionContent !== null) {
    return (
      <section
        aria-label={`採用する${targetLabel}の選択状態`}
        className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-emerald-600/40 bg-background px-4 py-3 shadow-lg shadow-black/5"
      >
        <CheckCircle2
          aria-hidden="true"
          className="size-5 shrink-0 text-emerald-700"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-700">
            {targetLabel}を1件選択中
          </p>
          <p className="truncate text-sm font-medium" title={decisionContent}>
            {decisionContent}
          </p>
        </div>
        {isHost ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onStartSelection}
          >
            別の付箋を選ぶ
          </Button>
        ) : null}
      </section>
    );
  }

  if (!isHost) return null;

  return (
    <Button
      className="pointer-events-auto"
      type="button"
      disabled={disabled}
      onClick={onStartSelection}
    >
      <MousePointerClick aria-hidden="true" />
      採用する付箋を選ぶ
    </Button>
  );
}
