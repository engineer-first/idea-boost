"use client";

import { useRef, useState } from "react";
// ホストの「次のフェーズへ」操作の確認 Dialog（トリガーボタン込み）。
// 未完了メンバーがいる場合など、確認が必要な進行操作で表示する。
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
  isResultStep,
  isVotingStep,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "@/contracts/phase";
import { MemberAvatar } from "@/features/room-members";
import { getPhaseLabel } from "../logic/phase-labels";
import type { Member } from "../logic/room-reducer";
import styles from "./next-phase-confirm-dialog.module.css";

export type NextPhaseConfirmDialogProps = {
  phase: RoomPhase;
  disabled: boolean;
  onConfirm: () => void;
  onRequestAdvance?: (proceed: () => void) => void;
  requireConfirmation?: boolean;
  notReadyNames?: ReadonlyArray<string>;
  notReadyMembers?: ReadonlyArray<Pick<Member, "userId" | "name" | "color">>;
};

export function NextPhaseConfirmDialog({
  phase,
  disabled,
  onConfirm,
  onRequestAdvance,
  requireConfirmation = true,
  notReadyNames = [],
  notReadyMembers = [],
}: NextPhaseConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const proceed = useRef<() => void>(() => {});
  proceed.current = () => {
    if (disabled) return;
    if (requireConfirmation) setOpen(true);
    else onConfirm();
  };
  const beginsVoting =
    phase.kind === "step" &&
    phase.step === VOTING_STEP_BY_PHASE[phase.phase] - 1;
  const trigger = (
    <Button
      type="button"
      variant={disabled ? "ghost" : "default"}
      className={`h-10 px-4 max-[900px]:px-2 max-[900px]:text-xs ${disabled ? styles.pending : styles.ready}`}
      disabled={disabled}
      onClick={(event) => {
        if (onRequestAdvance) {
          event.preventDefault();
          onRequestAdvance(() => proceed.current());
        } else if (!requireConfirmation) {
          event.preventDefault();
          onConfirm();
        }
      }}
    >
      次のステップへ
    </Button>
  );
  // 全員完了後も構造を維持し、閉じたときにトリガーへフォーカスを戻す。
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {notReadyNames.length > 0
              ? "完了していないメンバーがいます"
              : !requireConfirmation
                ? "全員が完了しました"
                : "次のステップへ進みますか？"}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {notReadyNames.length > 0 ? (
              <span className="block">
                全員の完了を待たずに、次のステップへ進みますか？
              </span>
            ) : !requireConfirmation ? (
              <span className="block">このまま「次へ進む」を押せます。</span>
            ) : null}
            {getPhaseLabel(phase)}から次のステップへ進みます。
            {beginsVoting
              ? "投票へ進むと、このフェーズの個人作業・共有を終了します。未共有の下書きは残りますが、次フェーズへ進むとき（最終フェーズは採用時）に破棄されます。共有し忘れた付箋があれば、キャンセルして個人作業・共有へ戻ってください。"
              : isResultStep(phase)
                ? "決定内容を引き継ぎ、このフェーズの未共有の下書きを破棄します。"
                : isVotingStep(phase)
                  ? "投票を終了し、今回の結果を全員に表示します。"
                  : "本文のある共有付箋と下書きは残ります。"}
            このフェーズの空白だけの共有付箋は削除します。
            {phase.kind === "step" && phase.step === 1
              ? " この個人作業ステップの空白だけのマイ付箋も削除します。"
              : phase.kind === "step" && phase.step === 2
                ? " この共有ステップの空白だけのマイ付箋も削除します。"
                : null}
            タイマーは停止します。
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

          <AlertDialogAction disabled={disabled} onClick={onConfirm}>
            次へ進む
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
