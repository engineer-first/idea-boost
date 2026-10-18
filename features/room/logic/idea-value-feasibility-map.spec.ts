import { describe, expect, it } from "vitest";
import {
  getFixedIdeaMapNotePointFromClientPosition,
  getFixedIdeaMapNotePosition,
  getIdeaMapAxisLabelFontSize,
  getIdeaMapDisplayScale,
  getIdeaMapNoteDisplayMetrics,
  getIdeaMapNoteGeometry,
  getIdeaMapNotePointFromClientPosition,
  getIdeaValueFeasibilityMapDimensions,
  getIdeaValueFeasibilityMapNotePosition,
  getIdeaValueFeasibilityMapPointFromClientPosition,
  getIdeaValueFeasibilityMapPosition,
} from "./idea-value-feasibility-map";

describe("getIdeaValueFeasibilityMapPosition", () => {
  it("縮小した付箋を左上へ置くと、実表示の中心をマップ全体の百分率へ保存する", () => {
    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        115,
        125,
        { left: 100, top: 100, right: 500, bottom: 400 },
        { width: 100, height: 75 },
        { x: 15, y: 25 },
      ),
    ).toEqual({ feasibility: 12.5, value: 87.5 });
  });

  it("固定マップの親倍率とレスポンシブ倍率を分け、広さ変更後も付箋の中心を保つ", () => {
    const note = { content: "付箋", fontSize: 14 };
    const responsiveScale = 0.6;
    const baseMetrics = getIdeaMapNoteDisplayMetrics(note, 0, responsiveScale);
    const smallerMetrics = getIdeaMapNoteDisplayMetrics(
      note,
      4,
      responsiveScale,
    );
    expect(baseMetrics.scale).toBe(1);
    expect(smallerMetrics.scale).toBe(getIdeaMapDisplayScale(4));

    for (const metrics of [baseMetrics, smallerMetrics]) {
      const grabOffset = { x: metrics.width * 0.35, y: metrics.height * 0.3 };
      const point = getFixedIdeaMapNotePointFromClientPosition(
        250 - metrics.width / 2 + grabOffset.x,
        150 - metrics.height / 2 + grabOffset.y,
        { left: 0, top: 0, right: 1000, bottom: 600 },
        metrics,
        grabOffset,
      );
      expect(point?.feasibility).toBeCloseTo(25, 10);
      expect(point?.value).toBeCloseTo(75, 10);
    }
  });

  it.each([
    [0, 48],
    [2, 58],
    [4, 70],
    [15, 87],
  ])("マップの広さ%iで軸ラベルを適切なサイズへ拡縮する", (sizeLevel, expected) => {
    expect(getIdeaMapAxisLabelFontSize(sizeLevel)).toBe(expected);
  });

  it("固定マップは付箋の表示寸法に合わせて移動範囲を端まで使う", () => {
    expect(
      getFixedIdeaMapNotePosition({ feasibility: 0, value: 100 }, 150),
    ).toEqual({ left: "0%", bottom: "calc(100% - 150px)" });
    expect(
      getFixedIdeaMapNotePosition({ feasibility: 100, value: 0 }, 320),
    ).toEqual({ left: "calc(100% - 200px)", bottom: "0%" });
  });

  it("縮小倍率と実際の付箋サイズを使い、四辺で付箋の外側をマップ枠へ合わせる", () => {
    const size = { width: 100, height: 75 };
    const bounds = { left: 100, top: 100, right: 500, bottom: 300 };
    const grabOffset = { x: 50, y: 37.5 };

    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        100,
        200,
        bounds,
        size,
        grabOffset,
      ),
    ).toEqual({ feasibility: 12.5, value: 50 });
    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        500,
        200,
        bounds,
        size,
        grabOffset,
      ),
    ).toEqual({ feasibility: 87.5, value: 50 });
    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        300,
        100,
        bounds,
        size,
        grabOffset,
      ),
    ).toEqual({ feasibility: 50, value: 81.25 });
    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        300,
        300,
        bounds,
        size,
        grabOffset,
      ),
    ).toEqual({ feasibility: 50, value: 18.75 });
  });

  it("表示サイズが変わっても、マップ内の中心位置から同じ評価値へ戻す", () => {
    expect(
      getFixedIdeaMapNotePointFromClientPosition(
        300,
        200,
        { left: 100, top: 100, right: 500, bottom: 300 },
        { width: 50, height: 25 },
        { x: 25, y: 12.5 },
      ),
    ).toEqual({ feasibility: 50, value: 50 });
  });

  it("縮小表示した付箋は表示倍率と各viewportのtransform originを反映する", () => {
    expect(
      getFixedIdeaMapNotePosition({ feasibility: 100, value: 100 }, 150, {
        displayScale: 0.5,
        responsiveScale: 0.6,
        transformOriginX: 0.3,
        transformOriginY: 0.7,
      }),
    ).toEqual({
      left: "calc(100% - 90px)",
      bottom: "calc(100% - 67.5px)",
    });
  });

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

  it("共有範囲が広がるほど固定マップ内部の表示倍率を下げる", () => {
    expect(getIdeaMapDisplayScale(0)).toBe(1);
    expect(getIdeaMapDisplayScale(1)).toBeCloseTo(1 / 1.1);
    expect(getIdeaMapDisplayScale(2)).toBeCloseTo(1 / 1.21);
    expect(getIdeaMapDisplayScale(15)).toBeLessThan(getIdeaMapDisplayScale(2));
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
  it("価値と実現のしやすさの0〜100を連続座標へ変換する", () => {
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

  it("マップ平面上のポインター位置を価値・実現のしやすさの0〜100へ変換する", () => {
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
