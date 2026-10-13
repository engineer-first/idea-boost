"use client";

// ホストの「次のフェーズへ」操作の確認 Dialog（トリガーボタン込み）。
// フェーズ移行は付箋の整理を伴うため、必ず確認を挟む。
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
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  isPersonalWritingStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "@/contracts/phase";
import { MemberAvatar } from "@/features/room-members";
import { getPhaseLabel } from "../logic/phase-labels";
import type { Member } from "../logic/room-reducer";

export type NextPhaseConfirmDialogProps = {
  phase: RoomPhase;
  disabled: boolean;
  onConfirm: () => void;
  requireConfirmation?: boolean;
  notReadyNames?: ReadonlyArray<string>;
  notReadyMembers?: ReadonlyArray<Pick<Member, "userId" | "name" | "color">>;
};

export function NextPhaseConfirmDialog({
  phase,
  disabled,
  onConfirm,
  requireConfirmation = true,
  notReadyNames = [],
  notReadyMembers = [],
}: NextPhaseConfirmDialogProps) {
  const beginsVoting =
    phase.kind === "step" &&
    phase.step === VOTING_STEP_BY_PHASE[phase.phase] - 1;
  const trigger = (
    <Button
      type="button"
      className="h-10 px-4 max-[900px]:px-2 max-[900px]:text-xs"
      disabled={disabled}
      onClick={requireConfirmation ? undefined : onConfirm}
    >
      次のステップへ
    </Button>
  );
  if (!requireConfirmation) return trigger;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {notReadyNames.length > 0
              ? "完了していないメンバーがいます"
              : "次のステップへ進みますか？"}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {notReadyNames.length > 0 ? (
              <span className="block">
                全員の完了を待たずに、次のステップへ進みますか？
              </span>
            ) : (
              `${getPhaseLabel(phase)}から次のステップへ進みます。${beginsVoting ? "投票へ進むと、このフェーズの個人作業・共有を終了します。未共有の下書きは残りますが、次フェーズへ進むとき（最終フェーズは採用時）に破棄されます。共有し忘れた付箋があれば、キャンセルして個人作業・共有へ戻ってください。" : isResultStep(phase) ? "決定内容を引き継ぎ、このフェーズの未共有の下書きを破棄します。" : isVotingStep(phase) ? "投票を終了し、今回の結果を全員に表示します。" : "本文のある共有付箋と下書きは残ります。"}このフェーズの空白だけの共有付箋は削除します。${phase.kind === "step" && isPersonalWritingStep(phase) ? " 個人で書き出すステップの空白だけのマイ付箋も削除します。" : ""}タイマーは停止します.`
            )}
          </AlertDialogDescription>
          {notReadyNames.length > 0 ? (
            <TooltipProvider>
              <fieldset
                aria-label="未完了のメンバー"
                className="mt-3 flex flex-wrap gap-2"
              >
                {(notReadyMembers.length > 0
                  ? notReadyMembers
                  : notReadyNames.map((name, index) => ({
                      userId: `not-ready-${index}`,
                      name,
                      color: "stone" as const,
                    }))
                ).map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1"
                  >
                    <MemberAvatar
                      name={member.name}
                      color={member.color}
                      size={28}
                    />
                    <span className="text-sm">{member.name}</span>
                  </div>
                ))}
              </fieldset>
            </TooltipProvider>
          ) : null}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>

          <AlertDialogAction onClick={onConfirm}>次へ進む</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
