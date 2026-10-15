import { describe, expect, it } from "vitest";
import {
  SharedOutcomeSnapshotSchema,
  SharedOutcomeSummarySchema,
} from "./shared-outcomes";
import { buildSharedOutcome } from "./shared-outcomes.fixture";

describe("成果の参加人数の境界", () => {
  it.each([-1, 1.5, "2"])("不正な人数 %s を拒否する", (participantCount) => {
    const record = buildSharedOutcome();
    expect(
      SharedOutcomeSummarySchema.safeParse({ ...record, participantCount })
        .success,
    ).toBe(false);
    expect(
      SharedOutcomeSnapshotSchema.safeParse({
        ...record.snapshot,
        participantCount,
      }).success,
    ).toBe(false);
  });
});
