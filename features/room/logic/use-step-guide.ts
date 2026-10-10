"use client";

import { useEffect, useRef, useState } from "react";

import type { TimerState } from "@/contracts/room-protocol";

export type StepGuideState = "intro" | "compact" | "detail";

/** 共有状態には含めない、参加者・ルーム・タブごとの案内の記録。 */
export function useStepGuide({
  phaseKey,
  sessionKey,
  isReady,
  initialState,
  timer,
}: {
  phaseKey: string;
  sessionKey: string;
  isReady: boolean;
  initialState?: StepGuideState;
  timer?: TimerState;
}): {
  state: StepGuideState;
  isBoundary: boolean;
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
  const activeSession = useRef(sessionKey);
  const remaining = useRef(5000);
  const resetCountdown = useRef(false);
  const firstState = useRef(initialState);
  const [boundaryPhase, setBoundaryPhase] = useState<string | null>(null);
  const endedSeen = useRef(new Set<string>());
  const boundaryEligible = phaseKey === "1-3" || phaseKey === "3-3";
  const isBoundary =
    isReady &&
    boundaryEligible &&
    timer?.status === "ended" &&
    boundaryPhase === phaseKey;

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (activeSession.current !== sessionKey) {
      activeSession.current = sessionKey;
      activePhase.current = null;
      seen.current.clear();
      endedSeen.current.clear();
      setBoundaryPhase(null);
    }
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
        ? firstState.current === "intro" && window.innerWidth <= 639
          ? "compact"
          : firstState.current
        : visited || window.innerWidth <= 639
          ? "compact"
          : "intro",
    );
    setFocused(false);
    activePhase.current = phaseKey;
    seen.current.add(phaseKey);
    remaining.current = 5000;
  }, [phaseKey, sessionKey, isReady, visible]);

  useEffect(() => {
    if (!isReady && boundaryPhase !== null) {
      setState((current) => (current === "intro" ? "compact" : current));
    }
    if (!boundaryEligible || timer?.status !== "ended") {
      if (boundaryPhase !== null) {
        setBoundaryPhase(null);
        if (boundaryPhase === phaseKey)
          setState((current) => (current === "intro" ? "compact" : current));
      }
      if (timer?.status === "running" || timer?.status === "paused") {
        endedSeen.current.delete(phaseKey);
        try {
          sessionStorage.removeItem(
            `step-guide-boundary:${sessionKey}:${phaseKey}`,
          );
        } catch {}
      }
      return;
    }
    if (!isReady || !visible || activePhase.current !== phaseKey) return;
    setBoundaryPhase(phaseKey);
    const key = `step-guide-boundary:${sessionKey}:${phaseKey}`;
    let visited = endedSeen.current.has(phaseKey);
    try {
      visited ||= sessionStorage.getItem(key) === "seen";
      sessionStorage.setItem(key, "seen");
    } catch {}
    endedSeen.current.add(phaseKey);
    if (!visited) {
      resetCountdown.current = true;
      setState((current) => (current === "detail" ? current : "intro"));
    }
  }, [
    phaseKey,
    sessionKey,
    timer?.status,
    isReady,
    visible,
    boundaryEligible,
    boundaryPhase,
  ]);

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
    if (resetCountdown.current && boundaryPhase !== null) {
      remaining.current = 5000;
      resetCountdown.current = false;
    }
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
  }, [state, phaseKey, isReady, visible, hovered, focused, boundaryPhase]);

  return {
    state:
      !isReady && state === "intro" && boundaryPhase !== null
        ? "compact"
        : state,
    isBoundary,
    setState,
    setHovered,
    setFocused,
  };
}
