import { describe, expect, it } from "vitest";
import { placeRoomTimer } from "./timer-position";

const bounds = { left: 0, top: 0, right: 1280, bottom: 720 };
describe("タイマーの配置", () => {
  it("72pxのタイマーを画面下端まで移動しても余白を残す", () => {
    expect(placeRoomTimer({ right: 1268, top: 720 }, 72, bounds, [])).toEqual({
      right: 1268,
      top: 636,
    });
  });
  it("右上HUDと付箋一覧の間に72pxの円を置ける", () => {
    expect(
      placeRoomTimer({ right: 1268, top: 80 }, 72, bounds, [
        { left: 950, right: 1268, top: 12, bottom: 68 },
        { left: 1028, right: 1268, top: 164, bottom: 630 },
      ]),
    ).toEqual({ right: 1268, top: 80 });
  });
  it("楕円へ広がっても同じ行でマイ付箋を避ける", () => {
    expect(
      placeRoomTimer({ right: 1268, top: 80 }, 450, bounds, [
        { left: 1028, right: 1268, top: 164, bottom: 630 },
      ]),
    ).toEqual({ right: 1268, top: 80 });
  });
  it("付箋HUDに重なる移動先はその上の空き領域へ収める", () => {
    const p = placeRoomTimer({ right: 1268, top: 300 }, 72, bounds, [
      { left: 1028, right: 1268, top: 148, bottom: 630 },
    ]);
    expect(p.top + 72 <= 136 || p.right <= 1016 || p.top >= 642).toBe(true);
  });
  it("画面外に置こうとしても円全体を画面内に残す", () => {
    expect(placeRoomTimer({ right: 2000, top: -200 }, 72, bounds, [])).toEqual({
      right: 1268,
      top: 12,
    });
  });
});
