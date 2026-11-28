import { describe, expect, it } from "vitest";
import {
  getAdvanceNoticeSecondsLeft,
  getNextStepPhase,
} from "./advance-notice";

describe("getNextStepPhase", () => {
  it.each([
    [
      { kind: "step", phase: 1, step: 1 },
      { kind: "step", phase: 1, step: 2 },
    ],
    [
      { kind: "step", phase: 1, step: 5 },
      { kind: "step", phase: 2, step: 1 },
    ],
    [
      { kind: "step", phase: 2, step: 4 },
      { kind: "step", phase: 3, step: 1 },
    ],
    [
      { kind: "step", phase: 3, step: 4 },
      { kind: "step", phase: 3, step: 5 },
    ],
  ] as const)("%o の次は %o", (current, next) => {
    expect(getNextStepPhase(current)).toEqual(next);
  });

  it("最終ステップ（3-5）と開始待ちには次のステップが無い", () => {
    expect(getNextStepPhase({ kind: "step", phase: 3, step: 5 })).toBeNull();
    expect(getNextStepPhase({ kind: "lobby" })).toBeNull();
  });
});

describe("getAdvanceNoticeSecondsLeft", () => {
  it("残りを秒へ切り上げ、過ぎた後は 0 にする", () => {
    expect(getAdvanceNoticeSecondsLeft(5000, 0, 0)).toBe(5);
    expect(getAdvanceNoticeSecondsLeft(5000, 0, 100)).toBe(5);
    expect(getAdvanceNoticeSecondsLeft(5000, 0, 4001)).toBe(1);
    expect(getAdvanceNoticeSecondsLeft(5000, 0, 9000)).toBe(0);
  });

  it("サーバー時刻との差を足して、手元の時計のずれを打ち消す", () => {
    expect(getAdvanceNoticeSecondsLeft(5000, -2000, 2000)).toBe(5);
  });
});
