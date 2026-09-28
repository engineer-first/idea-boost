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
import {
  isResultStep,
  isVotingStep,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "@/contracts/phase";
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
  const beginsVoting =
    phase.kind === "step" &&
    phase.step === VOTING_STEP_BY_PHASE[phase.phase] - 1;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className="h-10 px-4 max-[900px]:px-2 max-[900px]:text-xs"
          disabled={disabled}
        >
          次のステップへ
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>次のステップへ進みますか？</AlertDialogTitle>

          <AlertDialogDescription>
            {getPhaseLabel(phase)}
            から次のステップへ進みます。
            {beginsVoting
              ? "投票へ進むと、このフェーズの個人作業・共有には戻れません。未共有の下書きは残りますが、次フェーズへ進むとき（最終フェーズは採用時）に破棄されます。共有し忘れた付箋があれば、キャンセルして個人作業・共有へ戻ってください。"
              : isResultStep(phase)
                ? "決定内容を引き継ぎ、このフェーズの未共有の下書きを破棄します。前のフェーズへは戻れません。"
                : isVotingStep(phase)
                  ? "投票を終了し、今回の結果を全員に表示します。"
                  : "共有済み付箋と下書きは残ります。"}
            タイマーは停止します。
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
