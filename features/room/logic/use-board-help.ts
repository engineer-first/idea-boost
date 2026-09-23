"use client";

import { useEffect, useRef, useState } from "react";
import { isPhaseStep, type RoomPhase } from "@/contracts/phase";

export type BoardHelpKind = "hmw" | "idea" | "reference" | null;
export type BoardHelpTab = "write" | "expand";
export type BoardHelpControls = {
  kind: BoardHelpKind;
  isOpen: boolean;
  tab: BoardHelpTab;
  onOpenChange: (isOpen: boolean) => void;
  onTabChange: (tab: BoardHelpTab) => void;
};

export function useBoardHelp(phase: RoomPhase): BoardHelpControls {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const kind: BoardHelpKind = isPhaseStep(phase, 2, 1)
    ? "hmw"
    : isPhaseStep(phase, 3, 1)
      ? "idea"
      : isPhaseStep(phase, 3, 2)
        ? "reference"
        : null;
  const visited = useRef(new Set<string>());
  const activePhase = useRef(phaseKey);
  const initiallyOpen =
    (kind === "hmw" || kind === "idea") && !visited.current.has(phaseKey);
  const [display, setDisplay] = useState({
    phaseKey,
    isOpen: initiallyOpen,
    tab: "write" as BoardHelpTab,
  });
  useEffect(() => {
    if (activePhase.current !== phaseKey)
      visited.current.add(activePhase.current);
    activePhase.current = phaseKey;
    setDisplay({ phaseKey, isOpen: initiallyOpen, tab: "write" });
  }, [phaseKey, initiallyOpen]);
  const current =
    display.phaseKey === phaseKey
      ? display
      : { phaseKey, isOpen: initiallyOpen, tab: "write" as BoardHelpTab };
  return {
    kind,
    isOpen: kind !== null && current.isOpen,
    tab: current.tab,
    onOpenChange: (isOpen) => setDisplay({ ...current, isOpen }),
    onTabChange: (tab) => setDisplay({ ...current, tab }),
  };
}
