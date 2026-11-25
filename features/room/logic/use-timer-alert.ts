"use client";

import { useEffect, useRef, useState } from "react";
import type { TimerState } from "@/contracts/room-protocol";

export type TimerAlertKind = "oneMinute" | "timeUp";

/** 画面中央の通知を出しておく時間。作業を止めずに気づける長さにする */
export const TIMER_ALERT_VISIBLE_MS = 2_500;

const ONE_MINUTE_MS = 60_000;
// 裏のタブなどで遅れて届いた通知は、古い知らせになるので出さない。
const LATE_TOLERANCE_MS = 2_000;

export type UseTimerAlertOptions = {
  timer: TimerState;
  serverOffsetMs: number;
  active?: boolean;
  now?: () => number;
};

type ShownAlert = { kind: TimerAlertKind; runKey: number };

const systemNow = (): number => Date.now();

/**
 * 残り1分と時間切れの瞬間を、各回1度ずつ知らせる。
 * 見始める前に過ぎた節目や、設定時間が1分以下の回の残り1分は出さない。
 */
export function useTimerAlert({
  timer,
  serverOffsetMs,
  active = true,
  now = systemNow,
}: UseTimerAlertOptions): TimerAlertKind | null {
  const [shown, setShown] = useState<ShownAlert | null>(null);
  const firedKeys = useRef(new Set<string>());
  // 時間切れを予約した回。終了の受信が予約より先に届いたときに使う。
  const armedRun = useRef<{ endsAt: number; clientEndsAt: number } | null>(
    null,
  );
  const status = timer.status;
  const endsAt = timer.status === "running" ? timer.endsAt : null;
  const durationMs = timer.status === "running" ? timer.durationMs : 0;

  useEffect(() => {
    if (!active) {
      armedRun.current = null;
      setShown(null);
      return;
    }
    if (endsAt === null) {
      const armed = armedRun.current;
      armedRun.current = null;
      if (status === "paused") {
        setShown(null);
        return;
      }
      // 時間切れの通知は、終了や延長後の自動進行で未開始に戻っても出し切る。
      setShown((current) => (current?.kind === "timeUp" ? current : null));
      // サーバーの終了が手元の予定より先に届いたときは、ここで出す。
      if (
        armed &&
        Math.abs(now() - armed.clientEndsAt) <= LATE_TOLERANCE_MS &&
        !firedKeys.current.has(`timeUp:${armed.endsAt}`)
      ) {
        firedKeys.current.add(`timeUp:${armed.endsAt}`);
        setShown({ kind: "timeUp", runKey: armed.endsAt });
      }
      return;
    }
    setShown((current) =>
      current && current.runKey !== endsAt ? null : current,
    );

    const clientEndsAt = endsAt - serverOffsetMs;
    const scheduledAt = now();
    if (clientEndsAt > scheduledAt) armedRun.current = { endsAt, clientEndsAt };
    else if (armedRun.current?.endsAt !== endsAt) armedRun.current = null;
    const milestones: { kind: TimerAlertKind; dueAt: number }[] = [
      { kind: "timeUp", dueAt: clientEndsAt },
    ];
    if (durationMs > ONE_MINUTE_MS) {
      milestones.push({
        kind: "oneMinute",
        dueAt: clientEndsAt - ONE_MINUTE_MS,
      });
    }

    const timeouts: number[] = [];
    for (const { kind, dueAt } of milestones) {
      if (dueAt <= scheduledAt) continue;
      const key = `${kind}:${endsAt}`;
      const fire = () => {
        const lateByMs = now() - dueAt;
        if (lateByMs < 0) {
          timeouts.push(window.setTimeout(fire, Math.ceil(-lateByMs)));
          return;
        }
        if (lateByMs > LATE_TOLERANCE_MS || firedKeys.current.has(key)) return;
        firedKeys.current.add(key);
        setShown({ kind, runKey: endsAt });
      };
      timeouts.push(window.setTimeout(fire, Math.ceil(dueAt - scheduledAt)));
    }
    return () => {
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, [active, status, endsAt, durationMs, serverOffsetMs, now]);

  useEffect(() => {
    if (!shown) return;
    const timeout = window.setTimeout(
      () => setShown(null),
      TIMER_ALERT_VISIBLE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [shown]);

  return shown?.kind ?? null;
}
