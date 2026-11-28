"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import styles from "./next-step-button.module.css";

// 「次のステップへ」。工程固有の条件を満たしていれば、参加者の誰でもいつでも押せる
// （ADR 0037）。押すと全員に予告が出るので、ここでは確認を挟まない。

// 押せない間に、何を待てば進めるかをボタンの文言と面で示す。
export type NextStepWaiting =
  | { kind: "decision" }
  // 自分の票が残っている。
  | { kind: "votes" }
  // 自分は使い切ったが、ほかの人の票が残っている。
  | { kind: "votesOthers" }
  | { kind: "connection" };

export type NextStepButtonProps = {
  disabled: boolean;
  waiting?: NextStepWaiting;
  onPress: () => void;
  // 目を向けてほしいとき（条件がそろった・自分が「まって！」で止めた後）に光らせる。
  emphasized?: boolean;
  // 次のステップ（「1-2 共有」）。ボタンの横に小さく常に出す。
  nextStepLabel?: string;
};

function waitingLabel(
  waiting: NextStepWaiting | undefined,
  t: (key: string) => string,
) {
  if (waiting?.kind === "connection") return t("reconnecting");
  if (waiting?.kind === "decision") return t("decision");
  if (waiting?.kind === "votes") return t("votes");
  if (waiting?.kind === "votesOthers") return t("votesOthers");
  return null;
}

export function NextStepButton({
  disabled,
  waiting,
  onPress,
  emphasized = false,
  nextStepLabel,
}: NextStepButtonProps) {
  const messages = useTranslations("app.boardNextPhase");
  const translate = messages as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const pendingLabel = disabled ? waitingLabel(waiting, translate) : null;
  return (
    <span className={styles.group}>
      {nextStepLabel ? (
        <span className={styles.hint} data-testid="next-step-hint">
          {translate("nextHint", { step: nextStepLabel })}
        </span>
      ) : null}
      <Button
        type="button"
        className={`text-sm h-10 px-4 max-[900px]:px-2 max-[900px]:text-sm ${disabled ? styles.pending : emphasized ? styles.ready : ""} ${disabled && waiting?.kind === "connection" ? styles.reconnecting : ""}`}
        disabled={disabled}
        data-emphasized={(!disabled && emphasized) || undefined}
        onClick={onPress}
      >
        {/* 待ちの文言は「{messages("next")}」の幅に収め、隣の操作の位置を動かさない。 */}
        <span className={styles.label}>
          <span>{pendingLabel ?? messages("next")}</span>
          <span aria-hidden="true" className={styles.reserve}>
            {messages("next")}
          </span>
        </span>
      </Button>
    </span>
  );
}
