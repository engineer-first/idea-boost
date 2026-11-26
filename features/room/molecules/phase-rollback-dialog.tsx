"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("app.boardRollback");
  const phaseMessages = useTranslations("app.boardLocation") as (
    key: string,
  ) => string;
  const [open, setOpen] = useState(false);
  const [finalConfirmation, setFinalConfirmation] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const targetNumber =
    target.kind === "step" ? `${target.phase}-${target.step}` : t("lobby");
  const phaseLabel = (value: RoomPhase) =>
    value.kind === "step"
      ? `${value.phase}-${value.step} ${phaseMessages(`fullSteps.${value.phase}-${value.step}`)}`
      : phaseMessages("waiting");
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
          {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        data-phase-rollback-dialog
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md"
      >
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>
            {finalConfirmation ? t("warning") : t("button")}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {finalConfirmation ? (
              t("confirm")
            ) : (
              <>
                {t("description")}
                <br />
                {t("changes")}
                <span className="whitespace-nowrap">
                  <strong className="font-semibold text-foreground">
                    {t("changesEnd")}
                  </strong>
                  。
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!finalConfirmation && (
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-1 text-xs leading-relaxed text-muted-foreground">
              {t("from", { phase: phaseLabel(phase) })}
            </p>
            <p className="font-semibold">
              {t("to", { phase: phaseLabel(target) })}
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" ref={cancelRef}>
            {t("cancel")}
          </AlertDialogCancel>
          {finalConfirmation ? (
            <AlertDialogAction
              className="min-h-11"
              disabled={disabled}
              onClick={onConfirm}
              variant="destructive"
            >
              {t("return", { step: targetNumber })}
            </AlertDialogAction>
          ) : (
            <Button
              className="h-12 w-full font-bold"
              type="button"
              disabled={disabled}
              onClick={() => {
                setFinalConfirmation(true);
                cancelRef.current?.focus();
              }}
            >
              {t("return", { step: targetNumber })}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
