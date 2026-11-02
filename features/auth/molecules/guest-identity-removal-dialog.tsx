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

export type GuestIdentityRemovalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function GuestIdentityRemovalDialog({
  open,
  onOpenChange,
  onConfirm,
}: GuestIdentityRemovalDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* ボードのルームメニュー（z-70）より前面で説明と操作を守る。 */}
      <AlertDialogContent
        overlayClassName="z-[80] bg-black/20 backdrop-blur-none"
        className="z-[80] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>本人情報を消しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            消すと、同じ本人としてこのブラウザからルームや成果に戻れなくなります。ルームから抜けるだけなら「ルームを退出」を使ってください。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">キャンセル</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={onConfirm}>
            消す
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
