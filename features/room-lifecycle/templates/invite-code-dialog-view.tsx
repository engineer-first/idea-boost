"use client";

// 招待コード参加の確認 Dialog の表示部。props in / callback out に徹し、
// Server Action・router・toast には触れない（Storybook に単体で載る）。
// 配線（joinRoom・遷移・open/pending 管理）は containers/invite-code-dialog。
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

import { inviteCopy } from "../logic/invite-copy";

export type InviteCodeDialogViewProps = {
  inviteCode: string;
  hostName: string;
  message?: string;
  open: boolean;
  // 参加処理中（多重押下防止）。true の間ボタンは disabled・文言は「参加中…」。
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function InviteCodeDialogView({
  inviteCode,
  hostName,
  message,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: InviteCodeDialogViewProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="invite-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hostName} さんが作成したルームに参加しますか？
          </AlertDialogTitle>
          <AlertDialogDescription>
            {inviteCopy.codeLabel}{" "}
            <span className="font-mono font-semibold">{inviteCode}</span>{" "}
            のルームに参加します。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {message && (
          <p role="alert" className="text-sm leading-relaxed">
            {message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            data-testid="invite-join-action"
          >
            {pending ? "参加中…" : "参加する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
