import { describe, expect, it } from "vitest";
import { formatCompletedDate } from "./completed-rooms-content";

describe("formatCompletedDate", () => {
  it.each([
    [Date.UTC(2026, 9, 1, 4, 54), "2026年10月1日 13:54"],
    [Date.UTC(2026, 9, 31, 15, 5), "2026年11月1日 00:05"],
  ])("%iを日付と時刻が区別できる日本時間へ変換する", (value, expected) => {
    expect(formatCompletedDate(value)).toBe(expected);
  });
});
