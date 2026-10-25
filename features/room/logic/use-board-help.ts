"use client";

import { useEffect, useState } from "react";
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
  const kind: BoardHelpKind = isPhaseStep(phase, 3, 1) ? "idea" : null;

  const [display, setDisplay] = useState({
    phaseKey,
    isOpen: false,
    tab: "write" as BoardHelpTab,
  });

  useEffect(() => {
    setDisplay({
      phaseKey,
      isOpen: false,
      tab: "write",
    });
  }, [phaseKey]);

  const current =
    display.phaseKey === phaseKey
      ? display
      : {
          phaseKey,
          isOpen: false,
          tab: "write" as BoardHelpTab,
        };

  return {
    kind,
    isOpen: kind !== null && current.isOpen,
    tab: current.tab,
    onOpenChange: (isOpen) => setDisplay({ ...current, isOpen }),
    onTabChange: (tab) => setDisplay({ ...current, tab }),
  };
}
