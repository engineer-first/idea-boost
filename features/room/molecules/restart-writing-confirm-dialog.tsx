"use client";

import { CornerUpLeft } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import type { RoomStepPhase } from "@/contracts/phase";
import styles from "./restart-writing-confirm-dialog.module.css";

export type RestartWritingConfirmDialogProps = {
  phaseNumber: RoomStepPhase["phase"];
  disabled: boolean;
  pending?: boolean;
  /** 狭い画面（900px 以下）で文字を隠し、アイコンだけのボタンにする。ほかの操作と1段に並べるときに使う。 */
  compactOnNarrow?: boolean;
  onConfirm: () => void;
};

export function RestartWritingConfirmDialog({
  phaseNumber,
  disabled,
  pending = false,
  compactOnNarrow = false,
  onConfirm,
}: RestartWritingConfirmDialogProps) {
  const t = useTranslations("app.boardRestart");
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const waiting = requested && pending;
  // 押す前に「全員で書くステップへ戻る」ことが分かるよう、戻り先の番号を操作名に含め、確認の決定ボタンと同じ言葉にする。
  const actionLabel = t("action", { step: `${phaseNumber}-1` });
  const label = waiting ? t("switching") : actionLabel;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRequested(false);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-10 shrink-0 text-sm ${styles.trigger} ${compactOnNarrow ? styles.compactOnNarrow : ""}`}
          title={compactOnNarrow ? label : undefined}
          disabled={disabled || pending}
          aria-busy={waiting || undefined}
        >
          <CornerUpLeft aria-hidden="true" className={styles.icon} />
          <span
            key={label}
            className={`${styles.label} inline-block transition-[opacity,translate] duration-[140ms] starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none`}
          >
            {label}
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className="text-balance"
            aria-label={t("aria", { step: `${phaseNumber}-1` })}
          >
            <span className="inline-block">
              {t("aria", { step: `${phaseNumber}-1` })}
            </span>
            <wbr />
            <span className="inline-block">{t("title")}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="max-[400px]:px-1 max-[400px]:text-sm">
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="max-[400px]:px-1 max-[400px]:text-sm"
            disabled={disabled || pending}
            onClick={() => {
              if (disabled || pending) return;
              setRequested(true);
              onConfirm();
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
