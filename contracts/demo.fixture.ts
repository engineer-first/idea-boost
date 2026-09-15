import type { DemoStatus } from "./demo";

export function buildDemoStatus(
  overrides: Partial<DemoStatus> = {},
): DemoStatus {
  return {
    checkpoint: "share",
    phase: { kind: "step", phase: 1, step: 2 },
    availableActions: ["share"],
    sharedCount: 0,
    votedCount: 0,
    ...overrides,
  };
}
