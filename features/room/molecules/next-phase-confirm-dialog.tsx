"use client";

import { type CSSProperties, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  | { kind: "decision" }
  | { kind: "votes" }
  | { kind: "connection" };

export type NextPhaseConfirmDialogProps = {
  disabled: boolean;
  waiting?: NextPhaseWaiting;
  onConfirm: () => void;
  onRequestAdvance?: (proceed: () => void) => void;
  // 押せない間も押されたことを受け取り、何を待っているかへ視線を導く。
  onPendingPress?: () => void;
  requireConfirmation?: boolean;
  notReadyNames?: ReadonlyArray<string>;
  notReadyMembers?: ReadonlyArray<
    Pick<Member, "userId" | "name" | "color" | "avatarId">
  >;
};

// 押下を受け取る待ち状態も、押せないボタンと同じ見た目にする（Button の disabled 表示と揃える）。
const PENDING_LOOK =
  "border-dashed border-line-strong bg-background text-muted-foreground shadow-none hover:bg-background";

function waitingLabel(
  waiting: NextPhaseWaiting | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (waiting?.kind === "connection") return t("reconnecting");
  if (waiting?.kind === "decision") return t("decision");
  if (waiting?.kind === "votes") return t("votes");
  if (waiting?.kind === "members" && waiting.remaining > 0)
    return t("members", { remaining: waiting.remaining });
  return null;
}

export function NextPhaseConfirmDialog({
  disabled,
  waiting,
  onConfirm,
  onRequestAdvance,
  onPendingPress,
  requireConfirmation = true,
  notReadyNames = [],
  notReadyMembers = [],
}: NextPhaseConfirmDialogProps) {
  const messages = useTranslations("app.boardNextPhase");
  const translate = messages as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const [open, setOpen] = useState(false);
  const proceed = useRef<() => void>(() => {});
  proceed.current = () => {
    if (disabled) return;
    if (requireConfirmation) setOpen(true);
    else onConfirm();
  };
  const pendingLabel = disabled ? waitingLabel(waiting, translate) : null;
  const pressableWhilePending = disabled && onPendingPress !== undefined;
  const readyRatio =
    disabled && waiting?.kind === "members" && waiting.total > 0
      ? (waiting.total - waiting.remaining) / waiting.total
      : 0;
  const trigger = (
    <Button
      type="button"
      className={`text-sm h-10 px-4 max-[900px]:px-2 max-[900px]:text-sm ${disabled ? styles.pending : styles.ready} ${disabled && waiting?.kind === "connection" ? styles.reconnecting : ""} ${pressableWhilePending ? PENDING_LOOK : ""}`}
      style={
        disabled
          ? ({ "--ready-ratio": readyRatio } as CSSProperties)
          : undefined
      }
      disabled={disabled && !pressableWhilePending}
      aria-disabled={pressableWhilePending || undefined}
      onClick={(event) => {
        if (pressableWhilePending) {
          event.preventDefault();
          onPendingPress?.();
        } else if (onRequestAdvance) {
          event.preventDefault();
          onRequestAdvance(() => proceed.current());
        } else if (!requireConfirmation) {
          event.preventDefault();
          onConfirm();
        }
      }}
    >
      {/* 待ちの文言は「{messages("next")}」の幅に収め、隣の操作の位置を動かさない。 */}
      <span className={styles.label}>
        <span>{pendingLabel ?? messages("next")}</span>
        <span aria-hidden="true" className={styles.reserve}>
          {messages("next")}
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
              ? messages("incomplete")
              : !requireConfirmation
                ? messages("allComplete")
                : messages("confirm")}
          </AlertDialogTitle>

          {notReadyNames.length > 0 ? (
            <TooltipProvider>
              <fieldset
                aria-label={messages("notReady")}
                className="mt-3 w-full rounded-lg border-0 bg-warning-soft px-3 py-3"
              >
                <p className="mb-2 text-sm font-bold text-warning">
                  {messages("notReadyCount", { count: notReadyNames.length })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(notReadyMembers.length > 0
                    ? notReadyMembers
                    : notReadyNames.map((name, index) => ({
                        userId: `not-ready-${index}`,
                        name,
                        color: "stone" as const,
                        avatarId: undefined,
                      }))
                  ).map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-2 rounded-full bg-background py-1 pr-3 pl-1"
                    >
                      <MemberAvatar
                        name={member.name}
                        avatarId={member.avatarId}
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
          <AlertDialogCancel>{messages("cancel")}</AlertDialogCancel>

          <AlertDialogAction disabled={disabled} onClick={onConfirm}>
            {messages("continue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
