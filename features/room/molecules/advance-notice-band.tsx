"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useState } from "react";
import type { RoomStepPhase } from "@/contracts/phase";
import {
  getAdvanceNoticeSecondsLeft,
  getNextStepPhase,
} from "../logic/advance-notice";
import styles from "./advance-notice-band.module.css";

// 次のステップへ進む前に、全員の画面の中央へ出す予告の帯（ADR 0037）。
// 残り時間の真実は RoomDO にあり、ここは配られた終了時刻を数えて見せるだけ。
// 強弱は4段：なぜ出たか（極小）→ 次のステップ（大）→ そこでやること（中）→
// いまの目安（小）。残り秒と止めるボタンは「大」と同じ強さにする。

export type AdvanceNoticeStop = {
  // hold: ほかの人が止める「まって！」 / withdraw: 押した本人の「やめる」 /
  // extend: 時間切れの「＋1分」。
  kind: "hold" | "withdraw" | "extend";
  onStop: () => void;
  disabled?: boolean;
};

export type AdvanceNoticeBandProps = {
  // self: 自分が押した / member: ほかの人が押した / votes: 全員の投票がそろった /
  // timer: 時間切れ。
  cause: "self" | "member" | "votes" | "timer";
  // cause が member のときの、押した人の名前。
  initiatorName?: string;
  // いまのステップ。次のステップと文言はここから決める。
  phase: RoomStepPhase;
  endsAt: number;
  durationMs: number;
  serverOffsetMs: number;
  // 止める操作。延長を使った後の時間切れでは null（止められない）。
  stop: AdvanceNoticeStop | null;
};

const TICK_MS = 200;

export function AdvanceNoticeBand({
  cause,
  initiatorName,
  phase,
  endsAt,
  durationMs,
  serverOffsetMs,
  stop,
}: AdvanceNoticeBandProps) {
  const t = useTranslations("app.boardAdvanceNotice");
  const stepNames = useTranslations("app.boardLocation");
  const translate = (key: string, values?: Record<string, string | number>) =>
    (t as (key: string, values?: Record<string, string | number>) => string)(
      key,
      values,
    );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const seconds = getAdvanceNoticeSecondsLeft(endsAt, serverOffsetMs, now);
  const leftRatio =
    durationMs > 0
      ? Math.min(1, Math.max(0, (endsAt - (now + serverOffsetMs)) / durationMs))
      : 0;
  const next = getNextStepPhase(phase);
  const phaseKey = `${phase.phase}-${phase.step}`;
  const who =
    cause === "member"
      ? translate("whoMember", { name: initiatorName ?? "" })
      : cause === "self"
        ? t("whoSelf")
        : cause === "votes"
          ? t("whoVotes")
          : t("whoTimer");
  const stopLabel =
    stop?.kind === "withdraw"
      ? t("withdraw")
      : stop?.kind === "extend"
        ? t("extend")
        : t("hold");

  return (
    <div
      role="status"
      aria-label={t("aria")}
      className={styles.band}
      data-testid="advance-notice-band"
    >
      <div
        className={styles.count}
        style={{ "--left-ratio": leftRatio } as CSSProperties}
      >
        {/* 残り秒は毎秒読み上げない。出た時の文言だけを読む。 */}
        <span aria-hidden="true" data-testid="advance-notice-seconds">
          {seconds}
        </span>
      </div>
      <div className={styles.text}>
        <p className={styles.who}>{who}</p>
        {next ? (
          <>
            <p className={styles.lead}>{t("nextLead")}</p>
            <p className={styles.step}>
              {translate("nextStep", {
                number: `${next.phase}-${next.step}`,
                name: (stepNames as (key: string) => string)(
                  `stepNames.${next.phase}-${next.step}`,
                ),
              })}
            </p>
            <p className={styles.todo}>{translate(`todo.${phaseKey}`)}</p>
            <p className={styles.enough}>{translate(`enough.${phaseKey}`)}</p>
          </>
        ) : null}
      </div>
      {stop ? (
        <button
          type="button"
          className={styles.stop}
          disabled={stop.disabled}
          onClick={stop.onStop}
        >
          {stopLabel}
        </button>
      ) : (
        <p className={styles.none}>{t("extensionUsed")}</p>
      )}
    </div>
  );
}
