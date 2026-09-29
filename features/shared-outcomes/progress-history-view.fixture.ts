import { fn } from "storybook/test";
import { buildProgressHistoryRecord } from "@/contracts/progress-history.fixture";

const record = buildProgressHistoryRecord();
export const historyArgs = {
  entries: [
    record,
    buildProgressHistoryRecord({
      id: "123e4567-e89b-42d3-a456-426614174012",
      sequence: 2,
      phase: { kind: "step", phase: 1, step: 4 },
      enteredAt: null,
      exitedAt: null,
      saveStatus: "open",
      action: null,
      nextPhase: null,
      snapshot: null,
    }),
  ],
  nextCursor: "2",
  loading: false,
  error: null,
  selected: record,
  record,
  recordLoading: false,
  recordError: null,
  onOpen: fn(),
  onMore: fn(),
  onRefresh: fn(),
  onRetry: fn(),
};
