"use client";

// 退出 / 解散の確認 Dialog。ボード画面とスタート画面の両方で使う。
// ホストは「ルームを解散」、参加者は「退出」の文言になる。
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

export type LeaveConfirmMode = "leave" | "disband";

export type LeaveConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLeaving: boolean;
  // ホストは disband、それ以外は leave（既定）。
  mode?: LeaveConfirmMode;
  completed?: boolean;
  onReturnToOutcome?: () => void;
};

const COPY: Record<
  LeaveConfirmMode,
  {
    title: string;
    description: string;
    detail: string;
    confirm: string;
    confirming: string;
  }
> = {
  leave: {
    title: "退出しますか？",
    description:
      "あなたのみが退出し、ホームへ戻ります。他のメンバーはそのまま作業を続けられます。",
    detail:
      "戻るには招待URLから再度参加してください。完了時に参加していない場合、成果はあとから見返せません。",
    confirm: "退出する",
    confirming: "退出中…",
  },
  disband: {
    title: "ルームを解散しますか？",
    description: "解散すると、参加中のメンバー全員が退出してホームへ戻ります。",
    detail:
      "ルームは削除され、招待URLも使えなくなります。保存済みの共有成果は、最後の利用から30日間保持されます。",
    confirm: "ルームを解散",
    confirming: "解散中…",
  },
};

export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isLeaving,
  mode = "leave",
  completed = false,
  onReturnToOutcome,
}: LeaveConfirmDialogProps) {
  const copy = completed
    ? {
        title: "退出しますか？",
        description:
          "あなたのみが退出し、ホームへ戻ります。完了時の閲覧権は退出しても残ります。",
        detail:
          "成果は、完了から30日間、ホームの「以前のルーム」から見返せます。",
        confirm: "退出する",
        confirming: "退出中…",
      }
    : COPY[mode];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 leading-6">
              <p className="font-medium text-foreground">{copy.description}</p>
              <p>{copy.detail}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="min-h-11"
            disabled={isLeaving}
            onClick={onReturnToOutcome}
          >
            {completed ? "退出をやめて成果へ戻る" : "キャンセル"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
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
