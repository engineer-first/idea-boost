"use client";

import { CheckCircle2, MousePointerClick, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
  /** 選択中の段で、{t("cancelLabel")}の前に並べるほかの操作（再投票など）。 */
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
  const t = useTranslations("app.boardAdopt");
  const targetLabel = t(
    phaseNumber === 1
      ? "targetNote"
      : phaseNumber === 2
        ? "targetQuestion"
        : "targetIdea",
  );

  if (decisionContent !== null) {
    return (
      <section
        aria-label={t("selected", { target: targetLabel })}
        className="pointer-events-auto flex h-14 max-w-xl items-center gap-3 rounded-xl border border-state-decided/40 bg-background p-1.5 pl-4 shadow-tool"
      >
        <CheckCircle2
          aria-hidden="true"
          className="size-5 shrink-0 text-state-decided-text"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-state-decided-text">
            {t("confirmed", { target: targetLabel })}
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
            {t("undo")}
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
        // 投票パレットに並ぶ存在感にするため、段を高くし、主色の丸で今の操作を示す。
        // 狭い幅では文言の行とボタンの行に折り返し、文言を縦に潰さない。
        className="pointer-events-auto flex min-h-16 max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border-2 border-primary bg-background p-2 pl-3 shadow-tool"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <MousePointerClick className="size-5" />
        </span>
        <div className="flex-1">
          <p className="whitespace-nowrap text-sm font-bold">
            {t("clickToSelect", { target: targetLabel })}
          </p>
        </div>
        {selectingActions}
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 text-sm"
          aria-label={t("cancel")}
          onClick={onCancelSelection}
        >
          <X aria-hidden="true" />
          {t("cancelLabel")}
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
      {t("chooseNote")}
    </Button>
  );
}
