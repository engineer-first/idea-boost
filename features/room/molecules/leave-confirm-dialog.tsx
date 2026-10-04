"use client";

// 退出 / 解散の確認 Dialog。ボード画面とスタート画面の両方で使う。
// ホストは「ルームを解散」、参加者は「退出」の文言になる。
import { useId, useState } from "react";
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
import type { LeaveOutcomeAccess } from "@/contracts/completed-rooms";

export type LeaveConfirmMode = "leave" | "disband";

export type LeaveConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (outcomeAccess: LeaveOutcomeAccess) => void;
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
  disband: {
    title: "ルームを解散しますか？",
    description:
      "解散するとルームは削除され、参加中のメンバーは全員退出になります。招待URLも使えなくなります。保存済みの共有成果は、最後の利用から30日間保持されます。",
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
  const [outcomeAccess, setOutcomeAccess] =
    useState<LeaveOutcomeAccess>("retain");
  const choiceId = useId();
  const copy =
    mode === "disband" && completed
      ? {
          title: "ルームを削除しますか？",
          description:
            "ルームは削除され、招待URLも使えなくなります。保存済みの共有成果は、最後の利用から30日間保持されます。全員が各自の成果を持ち帰ったか確認してください。",
          confirm: "ルームを削除",
          confirming: "削除中…",
        }
      : COPY[mode];

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isLeaving) return;
        if (!nextOpen) setOutcomeAccess("retain");
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "leave" && completed
              ? "このルームから退出して、ホームへ戻ります。"
              : copy.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mode === "leave" ? (
          <fieldset disabled={isLeaving} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">退出後の成果</legend>
            {(["retain", "discard"] as const).map((access) => (
              <label
                key={access}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default"
              >
                <input
                  type="radio"
                  name={`${choiceId}-outcome-access`}
                  value={access}
                  checked={outcomeAccess === access}
                  onChange={() => setOutcomeAccess(access)}
                  aria-labelledby={`${choiceId}-${access}-label`}
                  aria-describedby={`${choiceId}-${access}-description`}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 space-y-1">
                  <span
                    id={`${choiceId}-${access}-label`}
                    className="block text-sm font-medium"
                  >
                    {access === "retain"
                      ? "成果を残して退出"
                      : "成果を残さず退出"}
                  </span>
                  <span
                    id={`${choiceId}-${access}-description`}
                    className="block text-sm leading-relaxed text-muted-foreground"
                  >
                    {access === "retain"
                      ? completed
                        ? "ホームの「過去の成果を見る」から見返せます。保存期限はルーム完了から30日間です。"
                        : "ルームが完了したら、ホームの「過去の成果を見る」から見返せます。保存期限は完了から30日間です。"
                      : "自分の一覧には残らず、成果を見返せません。間違えて参加した場合はこちら。"}
                  </span>
                </span>
              </label>
            ))}
            <p className="text-sm leading-relaxed text-muted-foreground">
              どちらを選んでも、他の参加者の成果や共有した付箋は消えません。
            </p>
          </fieldset>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            className="min-h-11"
            disabled={isLeaving}
            onClick={onReturnToOutcome}
          >
            {completed
              ? mode === "disband"
                ? "削除をやめて成果へ戻る"
                : "退出をやめて成果へ戻る"
              : "キャンセル"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm(outcomeAccess);
            }}
            className="h-auto min-h-11 whitespace-normal"
            disabled={isLeaving}
            data-testid="leave-confirm-action"
          >
            {isLeaving
              ? copy.confirming
              : mode === "leave"
                ? outcomeAccess === "retain"
                  ? "成果を残して退出"
                  : "成果を残さず退出"
                : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
