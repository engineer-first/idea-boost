import { describe, expect, it } from "vitest";
import { formatCompletedDate, SCENE_STATUS } from "./completed-rooms-content";

describe("formatCompletedDate", () => {
  it.each([
    [Date.UTC(2026, 9, 1, 4, 54), "2026年10月1日 13:54"],
    [Date.UTC(2026, 9, 31, 15, 5), "2026年11月1日 00:05"],
  ])("%iを日付と時刻が区別できる日本時間へ変換する", (value, expected) => {
    expect(formatCompletedDate(value)).toBe(expected);
  });
});

describe("SCENE_STATUS", () => {
  it("保存の失敗は反映待ちと別の文言で、失敗と分かるように示す", () => {
    expect(SCENE_STATUS.failed).not.toBe(SCENE_STATUS.pending);
    expect(SCENE_STATUS.failed).toContain("失敗");
  });
});
