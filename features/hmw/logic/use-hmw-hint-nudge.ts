"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type HmwHintNudgeOptions = {
  scope: string;
  enabled: boolean;
  noteCount: number;
};

export type HmwHintNudge = {
  showNudge: boolean;
  hasBeenShown: boolean;
  cycle: number;
  restart: () => void;
  markActivity: () => void;
  setComposing: (composing: boolean) => void;
  dismiss: () => void;
};

type Clock = {
  scope: string;
  cycle: number;
  elapsed: number;
  idle: number;
  composing: boolean;
  seen: boolean;
};

export function useHmwHintNudge({
  scope,
  enabled,
  noteCount,
}: HmwHintNudgeOptions): HmwHintNudge {
  const clock = useRef<Clock>({
    scope,
    cycle: 0,
    elapsed: 0,
    idle: 0,
    composing: false,
    seen: false,
  });
  const count = useRef(noteCount);
  count.current = noteCount;
  const [notice, setNotice] = useState<string | null>(null);
  const [seenScope, setSeenScope] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const storageKey = `hmw-hint-nudge:${scope}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "seen";
    } catch {
      /* 保存できない環境ではこの画面内だけで保持する。 */
    }
    clock.current = {
      scope,
      cycle,
      elapsed: 0,
      idle: 0,
      composing: clock.current.scope === scope && clock.current.composing,
      seen,
    };
    setNotice(null);
    setSeenScope(seen ? scope : null);
  }, [scope, cycle]);

  useEffect(() => {
    if (!enabled) {
      setNotice(null);
      return;
    }
    let previous = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(now - previous, 1_000);
      previous = now;
      const current = clock.current;
      // 説明・設定などのダイアログ中や背景タブでは、作業時間を数えない。
      if (
        current.scope !== scope ||
        current.cycle !== cycle ||
        current.seen ||
        current.composing ||
        document.visibilityState === "hidden" ||
        document.querySelector('[role="dialog"]')
      )
        return;
      current.elapsed += elapsed;
      current.idle += elapsed;
      if (
        current.idle >= 45_000 ||
        (current.elapsed >= 90_000 &&
          count.current <= 1 &&
          current.idle >= 15_000)
      ) {
        current.seen = true;
        try {
          sessionStorage.setItem(`hmw-hint-nudge:${scope}`, "seen");
        } catch {
          /* この画面内の一度だけの表示は維持する。 */
        }
        setNotice(scope);
        setSeenScope(scope);
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [scope, enabled, cycle]);

  const markActivity = useCallback(() => {
    clock.current.idle = 0;
  }, []);
  const setComposing = useCallback((composing: boolean) => {
    clock.current.composing = composing;
    clock.current.idle = 0;
  }, []);
  const dismiss = useCallback(() => {
    clock.current.seen = true;
    setNotice(null);
    setSeenScope(scope);
    try {
      sessionStorage.setItem(`hmw-hint-nudge:${scope}`, "seen");
    } catch {
      /* 保存は必須にしない。 */
    }
  }, [scope]);

  const restart = useCallback(() => {
    clock.current = {
      scope,
      cycle: cycle + 1,
      elapsed: 0,
      idle: 0,
      composing: clock.current.scope === scope && clock.current.composing,
      seen: false,
    };
    setNotice(null);
    setSeenScope(null);
    try {
      sessionStorage.removeItem(`hmw-hint-nudge:${scope}`);
    } catch {
      /* 保存できない場合も、この画面では次の呼びかけを待てる。 */
    }
    setCycle((current) => current + 1);
  }, [scope, cycle]);

  return {
    showNudge: enabled && notice === scope,
    hasBeenShown: seenScope === scope,
    cycle,
    restart,
    markActivity,
    setComposing,
    dismiss,
  };
}
