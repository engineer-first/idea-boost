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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type BulkCandidateExclusionProps = {
  targetCount: number;
  disabled: boolean;
  onConfirm: () => void;
};

export function BulkCandidateExclusion({
  targetCount,
  disabled,
  onConfirm,
}: BulkCandidateExclusionProps) {
  const hasTargets = targetCount > 0;
  const buttonLabel = hasTargets
    ? `投票なしをまとめて候補から外す（${targetCount}件）`
    : "投票なしをまとめて候補から外す";

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-lg shadow-black/5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">候補を整理</p>
        <p className="text-xs text-muted-foreground">
          {hasTargets
            ? `主観・客観ともに投票のない共有済み候補が${targetCount}件あります`
            : "投票のない共有済み候補はありません"}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !hasTargets}
            aria-label={buttonLabel}
          >
            まとめて外す
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              投票のない候補{targetCount}件をまとめて外しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              実行時点でも主観・客観ともに投票のない共有済み候補だけを対象にします。実行後にまとめて元へ戻せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              {targetCount}件を候補から外す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
