"use client";

// フェーズ1・2の投票ステップの全員投票ゲートで phase:next が拒否された（voting-incomplete）
// とき、ホストへ「未投票メンバーを待たずに強制的に進むか」を確認する Dialog。
// 離脱したまま戻らないメンバーが居ても進行を止めないための脱出ハッチ。
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

export type ForceNextPhaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const FORCE_NEXT_PHASE_COPY = {
  title: "全員の投票が完了していません",
  description:
    "まだ投票を終えていないメンバーがいます。退出したまま戻らないメンバーがいる場合は、強制的に次のステップへ進めます。",
  confirm: "強制的に次へ進む",
  cancel: "キャンセル",
} as const;

export function ForceNextPhaseDialog({
  open,
  onOpenChange,
  onConfirm,
}: ForceNextPhaseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{FORCE_NEXT_PHASE_COPY.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {FORCE_NEXT_PHASE_COPY.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{FORCE_NEXT_PHASE_COPY.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            data-testid="force-next-phase-action"
          >
            {FORCE_NEXT_PHASE_COPY.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
