"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
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
  lastMember?: boolean;
  onClosed?: () => void;
};

const COPY: Record<
  LeaveConfirmMode,
  {
    title: string;
    description: string;
    confirm: string;
    confirming: string;
  }
> = {
  leave: {
    title: "退出しますか？",
    description:
      "退出すると、このルームに戻るには招待URLから再度参加する必要があります。",
    confirm: "退出する",
    confirming: "退出中…",
  },
};

export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLeaving,
  lastMember = false,
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
          <AlertDialogDescription>
            {lastMember
              ? "退出するとルームが終了し、招待URLは使えなくなります。"
              : copy.description}
          </AlertDialogDescription>
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
            className="h-auto min-h-11 whitespace-normal"
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
