"use client";

import { useEffect, useRef, useState } from "react";

export type StepGuideState = "intro" | "compact" | "detail";

/** 共有状態には含めない、参加者・ルーム・タブごとの案内の記録。 */
export function useStepGuide({
  phaseKey,
  sessionKey,
  isReady,
  initialState,
}: {
  phaseKey: string;
  sessionKey: string;
  isReady: boolean;
  initialState?: StepGuideState;
}): {
  state: StepGuideState;
  setState: (state: StepGuideState) => void;
  setHovered: (hovered: boolean) => void;
  setFocused: (focused: boolean) => void;
} {
  const [state, setState] = useState<StepGuideState>(initialState ?? "compact");
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const seen = useRef(new Set<string>());
  const activePhase = useRef<string | null>(null);
  const remaining = useRef(5000);
  const firstState = useRef(initialState);

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (activePhase.current === phaseKey || !isReady || !visible) return;
    const storageKey = `step-guide:${sessionKey}:${phaseKey}`;
    let visited = seen.current.has(phaseKey);
    try {
      visited ||= sessionStorage.getItem(storageKey) === "seen";
      sessionStorage.setItem(storageKey, "seen");
    } catch {
      // ストレージを使えない環境でも、表示中のルームでは再案内しない。
    }
    setState(
      activePhase.current === null && firstState.current !== undefined
        ? firstState.current
        : visited
          ? "compact"
          : "intro",
    );
    setFocused(false);
    activePhase.current = phaseKey;
    seen.current.add(phaseKey);
    remaining.current = 5000;
  }, [phaseKey, sessionKey, isReady, visible]);

  useEffect(() => {
    if (
      activePhase.current !== phaseKey ||
      state !== "intro" ||
      !isReady ||
      !visible ||
      hovered ||
      focused
    )
      return;
    const started = Date.now();
    const timer = window.setTimeout(
      () => setState("compact"),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [state, phaseKey, isReady, visible, hovered, focused]);

  return { state, setState, setHovered, setFocused };
}
