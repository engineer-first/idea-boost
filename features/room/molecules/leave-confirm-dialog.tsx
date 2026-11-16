"use client";

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

const COPY: Record<
  LeaveConfirmMode,
  {
    title: string;
    confirm: string;
    confirming: string;
  }
> = {
  leave: {
    title: "退出しますか？",
    confirm: "退出する",
    confirming: "退出中…",
  },
};

export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLeaving,
  onClosed,
}: LeaveConfirmDialogProps) {
  const copy = COPY.leave;

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
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={isLeaving}>
            キャンセル
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
            {isLeaving ? copy.confirming : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
