import { describe, expect, it } from "vitest";
import {
  IDEA_VALUE_FEASIBILITY_MAP_RANGE,
  isIdeaValueFeasibilityMapCoordinate,
} from "./board";

describe("IDEA_VALUE_FEASIBILITY_MAP_RANGE", () => {
  it("連続する2軸マップの座標を0〜100の範囲に限定する", () => {
    expect(IDEA_VALUE_FEASIBILITY_MAP_RANGE).toEqual({ min: 0, max: 100 });
    expect(isIdeaValueFeasibilityMapCoordinate(0)).toBe(true);
    expect(isIdeaValueFeasibilityMapCoordinate(50.5)).toBe(true);
    expect(isIdeaValueFeasibilityMapCoordinate(100)).toBe(true);
    expect(isIdeaValueFeasibilityMapCoordinate(-0.01)).toBe(false);
    expect(isIdeaValueFeasibilityMapCoordinate(100.01)).toBe(false);
  });
});
