import { describe, expect, it } from "vitest";
import {
  getIdeaMapDimensions,
  getInitialIdeaMapSizeLevel,
  IDEA_MAP_SIZE_LEVEL_RANGE,
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

describe("idea map size", () => {
  it("付箋総数から初期サイズ段階を決め、上限を守る", () => {
    expect(getInitialIdeaMapSizeLevel(0)).toBe(0);
    expect(getInitialIdeaMapSizeLevel(12)).toBe(0);
    expect(getInitialIdeaMapSizeLevel(13)).toBe(1);
    expect(getInitialIdeaMapSizeLevel(18)).toBe(3);
    expect(getInitialIdeaMapSizeLevel(56)).toBe(9);
    expect(getInitialIdeaMapSizeLevel(Number.NaN)).toBe(0);
    expect(getInitialIdeaMapSizeLevel(1_000_000)).toBe(
      IDEA_MAP_SIZE_LEVEL_RANGE.max,
    );
  });

  it("サイズ段階ごとに縦横を10%ずつ拡張し、基準寸法を維持する", () => {
    expect(getIdeaMapDimensions(0)).toEqual({ width: 1600, height: 900 });
    expect(getIdeaMapDimensions(1)).toEqual({ width: 1760, height: 990 });
    expect(getIdeaMapDimensions(IDEA_MAP_SIZE_LEVEL_RANGE.max)).toEqual({
      width: 6684,
      height: 3760,
    });
  });
});
