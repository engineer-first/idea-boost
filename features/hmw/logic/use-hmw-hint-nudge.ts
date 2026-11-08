"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type HmwHintNudgeOptions = {
  scope: string;
  enabled: boolean;
  noteCount: number;
};

export type HmwHintNudge = {
  showNudge: boolean;
  markActivity: () => void;
  setComposing: (composing: boolean) => void;
  dismiss: () => void;
};

type Clock = {
  scope: string;
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
    elapsed: 0,
    idle: 0,
    composing: false,
    seen: false,
  });
  const count = useRef(noteCount);
  count.current = noteCount;
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = `hmw-hint-nudge:${scope}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "seen";
    } catch {
      /* 保存できない環境ではこの画面内だけで保持する。 */
    }
    clock.current = { scope, elapsed: 0, idle: 0, composing: false, seen };
    setNotice(null);
  }, [scope]);

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
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [scope, enabled]);

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
    try {
      sessionStorage.setItem(`hmw-hint-nudge:${scope}`, "seen");
    } catch {
      /* 保存は必須にしない。 */
    }
  }, [scope]);

  return {
    showNudge: enabled && notice === scope,
    markActivity,
    setComposing,
    dismiss,
  };
}
