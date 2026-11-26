"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";

export type LeaveConfirmMode = "leave";

export type LeaveConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLeaving: boolean;
  mode?: LeaveConfirmMode;
  onClosed?: () => void;
};

export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLeaving,
  onClosed,
}: LeaveConfirmDialogProps) {
  const t = useTranslations("app.boardLeave");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isLeaving) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          if (onClosed) {
            event.preventDefault();
            onClosed();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={isLeaving}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className="h-12 whitespace-normal"
            disabled={isLeaving}
            data-testid="leave-confirm-action"
          >
            {isLeaving ? t("confirming") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
