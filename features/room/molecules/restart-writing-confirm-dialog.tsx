"use client";

import { SquarePen } from "lucide-react";
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
import type { RoomStepPhase } from "@/contracts/phase";
import styles from "./restart-writing-confirm-dialog.module.css";

export type RestartWritingConfirmDialogProps = {
  phaseNumber: RoomStepPhase["phase"];
  disabled: boolean;
  pending?: boolean;
  onConfirm: () => void;
};

export function RestartWritingConfirmDialog({
  phaseNumber,
  disabled,
  pending = false,
  onConfirm,
}: RestartWritingConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const waiting = requested && pending;
  const label = waiting ? "切り替え中…" : "付箋を書き足す";

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
          className={`h-10 shrink-0 text-sm ${styles.trigger}`}
          disabled={disabled || pending}
          aria-busy={waiting || undefined}
        >
          <SquarePen aria-hidden="true" className={styles.icon} />
          <span
            key={label}
            className="inline-block transition-[opacity,translate] duration-[140ms] starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none"
          >
            {label}
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className="text-balance"
            aria-label={`全員で${phaseNumber}-1に戻って、付箋を書き足しますか？`}
          >
            <span className="inline-block">
              全員で{phaseNumber}-1に戻って、
            </span>
            <wbr />
            <span className="inline-block">付箋を書き足しますか？</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            全員が書く時間（{phaseNumber}
            -1）に戻ります。共有済みの付箋と下書きは残ります。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="max-[400px]:px-1 max-[400px]:text-sm">
            キャンセル
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
            付箋を書き足す
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
