"use client";

// ホストの「次のフェーズへ」操作の確認 Dialog（トリガーボタン込み）。
// フェーズ移行は付箋の整理を伴う不可逆な操作なので、必ず確認を挟む。
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
import type { RoomPhase } from "@/contracts/phase";
import { getPhaseLabel } from "../logic/phase-labels";

export type NextPhaseConfirmDialogProps = {
  phase: RoomPhase;
  disabled: boolean;
  onConfirm: () => void;
};

export function NextPhaseConfirmDialog({
  phase,
  disabled,
  onConfirm,
}: NextPhaseConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" className="h-10 px-4" disabled={disabled}>
          次のステップへ
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>次のステップへ進みますか？</AlertDialogTitle>

          <AlertDialogDescription>
            {getPhaseLabel(phase)}
            から次のステップへ進みます。
            移行すると現在の付箋が整理され、一部の内容が引き継がれない場合があります。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>

          <AlertDialogAction onClick={onConfirm}>移行する</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
