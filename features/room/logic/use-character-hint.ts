"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPersonalWritingStep, type RoomPhase } from "@/contracts/phase";
import type { TimerState } from "@/contracts/room-protocol";

type CharacterHintOptions = {
  phase: RoomPhase;
  timer: TimerState;
  serverOffsetMs: number;
  noteCount: number;
  active?: boolean;
};

const HINTS = {
  empty: "思いついたことを、まず1枚書いてみよう。",
  warning: "残り30秒、今の考えをまとめよう。",
  ended: "時間になったよ、次の工程をみんなで確認しよう。",
} as const;

export function useCharacterHint({
  phase,
  timer,
  serverOffsetMs,
  noteCount,
  active = true,
}: CharacterHintOptions): { message: string | null; replay: () => void } {
  const [message, setMessage] = useState<string | null>(null);
  const lastMessage = useRef<string | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}:${phase.step}` : "lobby";
  const seen = useRef(new Set<string>());
  const previousPhaseKey = useRef<string | null>(null);
  const startedAt = useRef(Date.now());
  const show = useCallback((text: string) => {
    clearTimeout(hideTimeout.current);
    lastMessage.current = text;
    setMessage(text);
    hideTimeout.current = setTimeout(() => setMessage(null), 8_000);
  }, []);

  useEffect(() => {
    // 工程をまたいで古い一言を再生しない。タイマーの一時停止中も進捗案内を控える。
    if (previousPhaseKey.current === phaseKey) return;
    previousPhaseKey.current = phaseKey;
    seen.current.clear();
    startedAt.current = Date.now();
    lastMessage.current = null;
    clearTimeout(hideTimeout.current);
    setMessage(null);
  }, [phaseKey]);

  useEffect(() => {
    if (!active || phase.kind === "lobby") {
      clearTimeout(hideTimeout.current);
      setMessage(null);
      return;
    }
    const check = () => {
      const remaining =
        timer.status === "running"
          ? timer.endsAt - (Date.now() + serverOffsetMs)
          : null;
      const kind =
        timer.status === "ended" || (remaining !== null && remaining <= 0)
          ? "ended"
          : remaining !== null && remaining <= 30_000
            ? "warning"
            : timer.status === "running" &&
                isPersonalWritingStep(phase) &&
                noteCount === 0 &&
                Date.now() - startedAt.current >= 30_000
              ? "empty"
              : null;
      if (kind && !seen.current.has(kind)) {
        seen.current.add(kind);
        show(HINTS[kind]);
      }
    };
    check();
    const interval = setInterval(check, 1_000);
    return () => clearInterval(interval);
  }, [active, phase, timer, serverOffsetMs, noteCount, show]);

  useEffect(() => () => clearTimeout(hideTimeout.current), []);
  const replay = useCallback(() => {
    if (active && lastMessage.current) show(lastMessage.current);
  }, [active, show]);
  return { message, replay };
}
