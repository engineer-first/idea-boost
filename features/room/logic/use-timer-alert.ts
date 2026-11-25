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
  const status = timer.status;
  const endsAt = timer.status === "running" ? timer.endsAt : null;
  const durationMs = timer.status === "running" ? timer.durationMs : 0;

  useEffect(() => {
    if (!active) {
      setShown(null);
      return;
    }
    if (endsAt === null) {
      // 時間切れの通知はサーバーの終了を受けても出し切る。
      if (status !== "ended") setShown(null);
      return;
    }
    setShown((current) =>
      current && current.runKey !== endsAt ? null : current,
    );

    const clientEndsAt = endsAt - serverOffsetMs;
    const scheduledAt = now();
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
