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
} from "@/components/ui/alert-dialog";
import type { AdoptionPhaseNumber } from "./adopt-note-control";
export type AdoptionConfirmDialogProps = {
  target: { content: string; authorName: string } | null;
  phaseNumber: AdoptionPhaseNumber;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};
export function AdoptionConfirmDialog({
  target,
  phaseNumber,
  disabled,
  onCancel,
  onConfirm,
}: AdoptionConfirmDialogProps) {
  const label =
    phaseNumber === 1 ? "課題" : phaseNumber === 2 ? "問い" : "アイデア";
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>この{label}に決定しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            決定すると、このフェーズの再投票・候補整理・付箋移動を終了します。決定は取り消せません。
            {phaseNumber === 3
              ? "スプリントを完了し、未共有の下書きは破棄されます。"
              : "未共有の下書きは次のフェーズへ進むと破棄されます。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <blockquote className="max-h-64 overflow-y-auto rounded-lg bg-muted p-4">
          <p className="whitespace-pre-wrap break-words text-sm">
            {target?.content}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {target?.authorName}
          </p>
        </blockquote>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled || target === null}
            onClick={onConfirm}
          >
            この{label}に決定
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
