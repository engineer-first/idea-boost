import { describe, expect, it } from "vitest";
import {
  getIdeaMapNoteGeometry,
  getIdeaMapNotePointFromClientPosition,
  getIdeaValueFeasibilityMapDimensions,
  getIdeaValueFeasibilityMapNotePosition,
  getIdeaValueFeasibilityMapPointFromClientPosition,
  getIdeaValueFeasibilityMapPosition,
} from "./idea-value-feasibility-map";

describe("getIdeaValueFeasibilityMapPosition", () => {
  it("サイズ段階でマップだけを10%ずつ拡張し、付箋寸法と座標範囲を保つ", () => {
    expect(getIdeaValueFeasibilityMapDimensions(0)).toEqual({
      width: 1600,
      height: 900,
    });
    expect(getIdeaValueFeasibilityMapDimensions(1)).toEqual({
      width: 1760,
      height: 990,
    });
    expect(getIdeaValueFeasibilityMapDimensions(99)).toEqual({
      width: 6684,
      height: 3760,
    });
    expect(
      getIdeaValueFeasibilityMapNotePosition({ feasibility: 100, value: 0 }),
    ).toEqual({
      left: "1322px",
      bottom: "0px",
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
      left: "13.22px",
      bottom: "665.28px",
    });
  });
  it("長文付箋は実高を使って上下端からはみ出さない", () => {
    expect(
      getIdeaValueFeasibilityMapNotePosition(
        { feasibility: 50, value: 100 },
        600,
      ),
    ).toEqual({
      left: "661px",
      bottom: "222px",
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

it.each([
  0.25, 1, 2,
])("共通投影をzoom%s/サイズ変更/長文高さでも入力へ逆変換する", (zoom) => {
  for (const level of [0, 3]) {
    const geometry = getIdeaMapNoteGeometry(level, [150, 450]);
    const bounds = {
      left: 80,
      top: 40,
      right: 80 + geometry.width * zoom,
      bottom: 40 + geometry.height * zoom,
    };
    for (const point of [
      { feasibility: 0, value: 0 },
      { feasibility: 5, value: 5 },
      { feasibility: 95, value: 95 },
      { feasibility: 100, value: 100 },
    ]) {
      for (const noteHeight of [150, 450]) {
        const position = getIdeaValueFeasibilityMapNotePosition(
          point,
          noteHeight,
          geometry,
        );
        const x = bounds.left + (Number.parseFloat(position.left) + 100) * zoom;
        const y =
          bounds.bottom -
          (Number.parseFloat(position.bottom) + noteHeight / 2) * zoom;
        const restored = getIdeaMapNotePointFromClientPosition(
          x,
          y,
          bounds,
          geometry,
        );
        expect(restored?.feasibility).toBeCloseTo(point.feasibility);
        expect(restored?.value).toBeCloseTo(point.value);
      }
    }
  }
});
it("極端長文があっても短い付箋の移動域を残し、有限な入力を受理する", () => {
  const geometry = getIdeaMapNoteGeometry(0, [10000, 150]);
  expect(geometry.maxNoteHeight).toBeLessThan(geometry.height);
  expect(
    getIdeaMapNotePointFromClientPosition(
      300,
      300,
      { left: 0, top: 0, right: geometry.width, bottom: geometry.height },
      geometry,
    ),
  ).not.toBe(null);
});
