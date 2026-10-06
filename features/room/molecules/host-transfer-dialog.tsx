"use client";

import { Button } from "@/components/ui/button";
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
import type { Member } from "../logic/room-reducer";

export type HostTransferDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Member | null;
  onConfirm: (targetUserId: string) => void;
  pending: boolean;
  disconnected: boolean;
  blocked?: boolean;
  error: string | null;
  onClosed?: () => void;
  onRequestRemove?: () => void;
};

export function HostTransferDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
  pending,
  disconnected,
  blocked = false,
  error,
  onClosed,
  onRequestRemove,
}: HostTransferDialogProps) {
  const hostAction = (
    <AlertDialogAction
      className="h-auto min-h-11 whitespace-normal break-all"
      disabled={!target || pending || disconnected || blocked}
      onClick={(event) => {
        event.preventDefault();
        if (target) onConfirm(target.userId);
      }}
    >
      {pending
        ? "変更中…"
        : target
          ? `${target.name || "名前未設定"}さんをホストにする`
          : "ホストにする"}
    </AlertDialogAction>
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // 元の参加者Popoverが退出中でも、表示中の確認で取消を完結させる。
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
            {onRequestRemove
              ? "参加者の操作"
              : "このユーザーをホストにしますか？"}
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
          <AlertDialogDescription>
            {onRequestRemove
              ? "ホストにすると、開始・進行・解散の操作を渡します。作業内容はそのままです。"
              : "開始・進行・解散の操作を渡します。作業内容はそのままです。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!target ? (
          <p role="status" className="text-sm text-muted-foreground">
            このユーザーは退出しました。参加者を選び直してください。
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
        <div className="grid gap-3">
          {onRequestRemove ? (
            <>
              {hostAction}
              <AlertDialogFooter className="flex-row items-center justify-between sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-destructive"
                  disabled={!target || pending || disconnected || blocked}
                  onClick={onRequestRemove}
                >
                  ルームから外す…
                </Button>
                <AlertDialogCancel className="min-h-11" disabled={pending}>
                  キャンセル
                </AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                キャンセル
              </AlertDialogCancel>
              {hostAction}
            </AlertDialogFooter>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
