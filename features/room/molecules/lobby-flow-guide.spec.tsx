import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROOM_PHASE_STEP_LABELS } from "@/contracts/phase";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { LobbyFlowGuide } from "./lobby-flow-guide";

it("全体の流れのステップ名とやることは、進行の定義と同じ文言で示す", () => {
  render(<LobbyFlowGuide />);
  const guide = screen.getByTestId("lobby-flow-guide");
  for (const phase of [1, 2, 3] as const) {
    const labels: Record<number, string> = ROOM_PHASE_STEP_LABELS[phase];
    for (const [step, label] of Object.entries(labels)) {
      const action = getFacilitationGuide({
        kind: "step",
        phase,
        step: Number(step),
      } as Parameters<typeof getFacilitationGuide>[0])?.action;
      expect(guide).toHaveTextContent(label);
      expect(guide).toHaveTextContent(action ?? "");
    }
  }
});
