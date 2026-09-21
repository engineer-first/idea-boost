import { describe, expect, it } from "vitest";
import {
  getIdeaValueFeasibilityMapDimensions,
  getIdeaValueFeasibilityMapNotePosition,
  getIdeaValueFeasibilityMapPointFromClientPosition,
  getIdeaValueFeasibilityMapPosition,
} from "./idea-value-feasibility-map";

describe("getIdeaValueFeasibilityMapPosition", () => {
  it("サイズ段階でマップだけを20%ずつ拡張し、付箋寸法と座標範囲を保つ", () => {
    expect(getIdeaValueFeasibilityMapDimensions(0)).toEqual({
      width: 1600,
      height: 900,
    });
    expect(getIdeaValueFeasibilityMapDimensions(1)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(getIdeaValueFeasibilityMapDimensions(99)).toEqual({
      width: 6880,
      height: 3870,
    });
    expect(
      getIdeaValueFeasibilityMapNotePosition({ feasibility: 100, value: 0 }),
    ).toEqual({
      left: "clamp(0px, calc(100% - 100px), max(0px, calc(100% - 200px)))",
      bottom: "clamp(0px, calc(0% - 75px), max(0px, calc(100% - 150px)))",
    });
  });

  it.each([
    0.5, 2,
  ])("倍率%sでもパン後のポインターを同じ相対座標に変換する", (zoom) => {
    expect(
      getIdeaValueFeasibilityMapPointFromClientPosition(
        80 + 300 * zoom,
        40 + 100 * zoom,
        {
          left: 80,
          top: 40,
          right: 80 + 400 * zoom,
          bottom: 40 + 400 * zoom,
        },
      ),
    ).toEqual({ feasibility: 75, value: 75 });
  });
  it("端付近でも付箋全体の寸法を考慮して表示位置を制限する", () => {
    expect(
      getIdeaValueFeasibilityMapNotePosition({ feasibility: 1, value: 99 }),
    ).toEqual({
      left: "clamp(0px, calc(1% - 100px), max(0px, calc(100% - 200px)))",
      bottom: "clamp(0px, calc(99% - 75px), max(0px, calc(100% - 150px)))",
    });
  });
  it("価値と実現可能性の0〜100を連続座標へ変換する", () => {
    expect(
      getIdeaValueFeasibilityMapPosition({ value: 0, feasibility: 0 }),
    ).toEqual({ bottom: "0%", left: "0%" });
    expect(
      getIdeaValueFeasibilityMapPosition({ value: 80, feasibility: 65 }),
    ).toEqual({ bottom: "80%", left: "65%" });
    expect(
      getIdeaValueFeasibilityMapPosition({ value: 100, feasibility: 100 }),
    ).toEqual({ bottom: "100%", left: "100%" });
  });

  it("マップ平面上のポインター位置を価値・実現可能性の0〜100へ変換する", () => {
    expect(
      getIdeaValueFeasibilityMapPointFromClientPosition(300, 300, {
        left: 100,
        top: 100,
        right: 500,
        bottom: 500,
      }),
    ).toEqual({ feasibility: 50, value: 50 });
    expect(
      getIdeaValueFeasibilityMapPointFromClientPosition(50, 550, {
        left: 100,
        top: 100,
        right: 500,
        bottom: 500,
      }),
    ).toEqual({ feasibility: 0, value: 0 });
  });

  it("範囲外の座標は0〜100へ収める", () => {
    expect(
      getIdeaValueFeasibilityMapPosition({ value: -1, feasibility: 101 }),
    ).toEqual({ bottom: "0%", left: "100%" });
  });
});
