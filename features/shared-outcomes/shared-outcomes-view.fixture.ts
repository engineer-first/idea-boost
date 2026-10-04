import type { SharedOutcomeSummary } from "@/contracts/shared-outcomes";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
export function buildOutcomeList(count = 60): SharedOutcomeSummary[] {
  return Array.from({ length: count }, (_, index) => {
    const { snapshot: _snapshot, ...summary } = buildSharedOutcome({
      roomId: `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
      name: `企画の振り返り ${index + 1}`,
      displayId: `R-${String(index + 1).padStart(6, "0")}`,
      status: index % 3 === 0 ? "confirmed" : "partial",
    });
    return summary;
  });
}
