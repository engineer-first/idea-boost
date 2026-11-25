import { AlarmClock, Hourglass } from "lucide-react";
import type { TimerAlertKind } from "../logic/use-timer-alert";
import styles from "./timer-alert.module.css";

export type TimerAlertProps = {
  kind: TimerAlertKind | null;
};

// 時間切れはタイマー本体とキャラクターが読み上げるため、読み上げは残り1分だけにする。
const ALERTS = {
  oneMinute: {
    text: "あと1分！",
    Icon: Hourglass,
    iconClassName: "text-warning",
    announce: true,
  },
  timeUp: {
    text: "時間になりました！",
    Icon: AlarmClock,
    iconClassName: "text-foreground",
    announce: false,
  },
} as const;

/** 残り1分と時間切れを画面中央に短く知らせる。付箋の操作は通す */
export function TimerAlert({ kind }: TimerAlertProps) {
  const alert = kind ? ALERTS[kind] : null;
  return (
    <>
      {/* 読み上げソフトは既存の枠の中身の変化を読むため、枠は常に置いておく。 */}
      <p role="status" className="sr-only">
        {alert?.announce ? alert.text : ""}
      </p>
      {alert ? (
        <div
          aria-hidden="true"
          data-testid="timer-alert"
          data-kind={kind}
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-4"
        >
          <div
            key={kind}
            className={`${styles.card} flex items-center gap-3 rounded-xl border bg-background px-8 py-5 text-2xl font-bold text-foreground shadow-tool`}
          >
            <alert.Icon
              className={`size-8 shrink-0 ${alert.iconClassName}`}
              aria-hidden="true"
            />
            {alert.text}
          </div>
        </div>
      ) : null}
    </>
  );
}
