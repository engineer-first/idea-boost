import { describe, expect, it } from "vitest";
import { getStepGuideRevision, getStepGuideSlides } from "./step-guide-copy";
import { stepGuideSeenStorageKey } from "./step-guide-seen";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("stepGuideSeenStorageKey", () => {
  it("同じ本人・ステップ・版なら同じ記録を指し、ルームに左右されない", () => {
    expect(stepGuideSeenStorageKey(USER_ID, "1-3", 1)).toBe(
      stepGuideSeenStorageKey(USER_ID, "1-3", 1),
    );
    expect(stepGuideSeenStorageKey(USER_ID, "1-3", 1)).not.toContain("AB12CD");
  });

  it("案内の版が上がると、前の版の既読とは別の記録になる", () => {
    expect(stepGuideSeenStorageKey(USER_ID, "1-3", 2)).not.toBe(
      stepGuideSeenStorageKey(USER_ID, "1-3", 1),
    );
  });

  it("本人またはステップが違えば別の記録になる", () => {
    const base = stepGuideSeenStorageKey(USER_ID, "1-3", 1);
    expect(
      stepGuideSeenStorageKey("22222222-2222-4222-8222-222222222222", "1-3", 1),
    ).not.toBe(base);
    expect(stepGuideSeenStorageKey(USER_ID, "1-4", 1)).not.toBe(base);
  });

  it("版を省くと、そのステップの現在の版で記録する", () => {
    expect(stepGuideSeenStorageKey(USER_ID, "1-3")).toBe(
      stepGuideSeenStorageKey(USER_ID, "1-3", getStepGuideRevision("1-3")),
    );
  });
});

describe("getStepGuideRevision", () => {
  it.each(["1-1", "1-2", "1-3", "1-4", "1-5", "2-1", "3-1", "3-3"])(
    "自動表示する%sの案内は1以上の版を持つ",
    (phaseKey) => {
      expect(getStepGuideSlides(phaseKey).length).toBeGreaterThan(0);
      expect(getStepGuideRevision(phaseKey)).toBeGreaterThanOrEqual(1);
    },
  );
});
