"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import toolMotion from "@/components/ui/tool-motion.module.css";
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
  const locale = useLocale();
  const t = useTranslations("app.boardMoveHistory");
  const id = useId();
  return (
    <TooltipProvider>
      <fieldset
        className="pointer-events-auto flex min-w-0 shrink-0 items-center gap-1"
        aria-label={t("label")}
        aria-busy={pending}
      >
        <p className="sr-only">{t("description")}</p>
        {(
          [
            {
              action: undo,
              name: t("undo"),
              shortcut: "Ctrl / Cmd + Z",
              onClick: onUndo,
              Icon: Undo2,
              direction: "undo",
            },
            {
              action: redo,
              name: t("redo"),
              shortcut: "Ctrl / Cmd + Shift + Z",
              onClick: onRedo,
              Icon: Redo2,
              direction: "redo",
            },
          ] as const
        ).map(({ action, name, shortcut, onClick, Icon, direction }) => {
          const disabled = pending || action.disabled;
          const reason =
            locale === "en" && action.reason
              ? t("unavailable")
              : (action.reason ?? "");
          const actionDescription =
            locale === "en"
              ? t(direction === "undo" ? "undoDescription" : "redoDescription")
              : action.label;
          const description =
            locale === "en"
              ? `${name} (${shortcut}). ${actionDescription}. ${pending ? t("pending") : reason}`
              : `${name}（${shortcut}）。${actionDescription}。${pending ? t("pending") : reason}`;
          const shortcutLabel =
            locale === "en"
              ? `${name} (${shortcut})`
              : `${name}（${shortcut}）`;
          const tooltipText = reason
            ? `${shortcutLabel} — ${reason}`
            : shortcutLabel;
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
                    className={toolMotion.button}
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
                {tooltipText}
              </TooltipContent>
              <span id={`${id}-${direction}`} className="sr-only">
                {description}
              </span>
            </Tooltip>
          );
        })}
        {pending ? (
          <span role="status" className="sr-only">
            {t("pending")}
          </span>
        ) : null}
      </fieldset>
    </TooltipProvider>
  );
}
