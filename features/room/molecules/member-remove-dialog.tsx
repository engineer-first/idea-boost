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
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemberAvatar, NOTE_COLOR_NAMES } from "@/features/room-members";
import type { MemberRemovalControls } from "../logic/use-member-removal";

export type MemberRemoveDialogProps = Omit<MemberRemovalControls, "request"> & {
  onClosed?: () => void;
};

export function MemberRemoveDialog({
  open,
  target,
  pending,
  error,
  disconnected,
  blocked,
  onOpenChange,
  onConfirm,
  onClosed,
}: MemberRemoveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (!pending) onOpenChange(false);
        }}
        onCloseAutoFocus={(event) => {
          if (onClosed) {
            event.preventDefault();
            onClosed();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            この参加者をルームから外しますか？
          </AlertDialogTitle>
          {target ? (
            <div className="flex min-w-0 items-center gap-3">
              <TooltipProvider>
                <MemberAvatar name={target.name} color={target.color} />
              </TooltipProvider>
              <div className="min-w-0">
                <p className="break-all text-base font-semibold">
                  {target.name || "名前未設定"}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  識別色: {NOTE_COLOR_NAMES[target.color]}
                </p>
              </div>
            </div>
          ) : null}
          <AlertDialogDescription className="leading-relaxed">
            この参加者の画面はホームに戻ります。付箋や投票は残り、招待リンク・コードから再参加できます。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!target ? (
          <p role="status" className="text-sm text-muted-foreground">
            この参加者は退出しました。参加者を選び直してください。
          </p>
        ) : null}
        {disconnected ? (
          <p role="status" className="text-sm text-muted-foreground">
            再接続してから操作してください。
          </p>
        ) : null}
        {blocked ? (
          <p role="status" className="text-sm text-muted-foreground">
            進行中の操作が終わってから操作してください。
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={pending}>
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
            disabled={!target || pending || disconnected || blocked}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "退出処理中…" : "ルームから外す"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
