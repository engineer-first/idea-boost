import { describe, expect, it } from "vitest";
import {
  getIdeaMapDimensions,
  getInitialIdeaMapSizeLevel,
  getNoteHeight,
  IDEA_MAP_SIZE_LEVEL_RANGE,
  IDEA_VALUE_FEASIBILITY_MAP_RANGE,
  isIdeaValueFeasibilityMapCoordinate,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_SIZE_RANGE,
  NOTE_HEIGHT,
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

describe("note typography", () => {
  it("文字サイズを12〜24pxの1px刻み、既定14pxとして共有する", () => {
    expect(NOTE_FONT_SIZE_RANGE).toEqual({ min: 12, max: 24, step: 1 });
    expect(NOTE_DEFAULT_FONT_SIZE).toBe(14);
  });

  it("短文は従来高を維持し、長文は文字サイズを保ったまま全文ぶん縦へ伸ばす", () => {
    expect(getNoteHeight("短文", 24)).toBe(NOTE_HEIGHT);

    const mediumAt14 = getNoteHeight("あ".repeat(240), 14);
    const mediumAt24 = getNoteHeight("あ".repeat(240), 24);
    const maximumAt24 = getNoteHeight("あ".repeat(2_000), 24);

    expect(mediumAt14).toBeGreaterThan(NOTE_HEIGHT);
    expect(mediumAt24).toBeGreaterThan(mediumAt14);
    expect(maximumAt24).toBeGreaterThan(mediumAt24);
  });

  it("改行と長い英数字列も内部スクロールへ切り替えず必要高へ反映する", () => {
    expect(
      getNoteHeight(Array.from({ length: 40 }, () => "行").join("\n"), 14),
    ).toBeGreaterThan(NOTE_HEIGHT);
    expect(getNoteHeight("W".repeat(500), 24)).toBeGreaterThan(NOTE_HEIGHT);
  });
});
