"use client";

import { type CSSProperties, useRef, useState } from "react";
// 未完了メンバーがいる場合など、確認が必要な進行操作で表示する。
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemberAvatar } from "@/features/room-members";
import type { Member } from "../logic/room-reducer";
import styles from "./next-phase-confirm-dialog.module.css";

// 押せない間に、何を待てば進めるかをボタンの文言と面で示す。
export type NextPhaseWaiting =
  | { kind: "members"; remaining: number; total: number }
  | { kind: "connection" };

export type NextPhaseConfirmDialogProps = {
  disabled: boolean;
  waiting?: NextPhaseWaiting;
  onConfirm: () => void;
  onRequestAdvance?: (proceed: () => void) => void;
  requireConfirmation?: boolean;
  notReadyNames?: ReadonlyArray<string>;
  notReadyMembers?: ReadonlyArray<Pick<Member, "userId" | "name" | "color">>;
};

function waitingLabel(waiting: NextPhaseWaiting | undefined) {
  if (waiting?.kind === "connection") return "再接続中…";
  if (waiting?.kind === "members" && waiting.remaining > 0)
    return `あと${waiting.remaining}人で次へ`;
  return null;
}

export function NextPhaseConfirmDialog({
  disabled,
  waiting,
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
  const pendingLabel = disabled ? waitingLabel(waiting) : null;
  const readyRatio =
    disabled && waiting?.kind === "members" && waiting.total > 0
      ? (waiting.total - waiting.remaining) / waiting.total
      : 0;
  const trigger = (
    <Button
      type="button"
      className={`text-sm h-10 px-4 max-[900px]:px-2 max-[900px]:text-sm ${disabled ? styles.pending : styles.ready} ${disabled && waiting?.kind === "connection" ? styles.reconnecting : ""}`}
      style={
        disabled
          ? ({ "--ready-ratio": readyRatio } as CSSProperties)
          : undefined
      }
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
      {/* 待ちの文言は「次のステップへ」の幅に収め、隣の操作の位置を動かさない。 */}
      <span className={styles.label}>
        <span>{pendingLabel ?? "次のステップへ"}</span>
        <span aria-hidden="true" className={styles.reserve}>
          次のステップへ
        </span>
      </span>
    </Button>
  );
  // 全員完了後も構造を維持し、閉じたときにトリガーへフォーカスを戻す。
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {notReadyNames.length > 0
              ? "完了していないメンバーがいます"
              : !requireConfirmation
                ? "全員が完了しました"
                : "次のステップへ進みますか？"}
          </AlertDialogTitle>

          {notReadyNames.length > 0 ? (
            <TooltipProvider>
              <fieldset
                aria-label="未完了のメンバー"
                className="mt-3 w-full rounded-lg border-0 bg-warning-soft px-3 py-3"
              >
                <p className="mb-2 text-sm font-bold text-warning">
                  まだ完了していない {notReadyNames.length} 人
                </p>
                <div className="flex flex-wrap gap-2">
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
                      className="flex items-center gap-2 rounded-full bg-background py-1 pr-3 pl-1"
                    >
                      <MemberAvatar
                        name={member.name}
                        color={member.color}
                        size={28}
                      />
                      <span className="text-sm font-medium">{member.name}</span>
                    </div>
                  ))}
                </div>
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
