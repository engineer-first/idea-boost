import { describe, expect, it } from "vitest";
import { placeRoomTimer, snapRoomTimer } from "./timer-position";

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
  it("狭く低い画面では現在地の下かつ操作欄の左の空きへ収める", () => {
    expect(
      placeRoomTimer(
        { right: 308, top: 114 },
        72,
        { left: 0, top: 0, right: 320, bottom: 618 },
        [
          { left: 12, top: 12, right: 308, bottom: 102 },
          { left: 12, top: 110, right: 308, bottom: 364 },
          { left: 12, top: 522, right: 291, bottom: 606 },
          { left: 204, top: 456, right: 308, bottom: 514 },
        ],
      ),
    ).toEqual({ right: 192, top: 376 });
  });
});

describe("ドロップ時の端へのスナップ", () => {
  const overlaps = (
    p: { right: number; top: number },
    width: number,
    r: { left: number; top: number; right: number; bottom: number },
  ) =>
    p.right > r.left &&
    p.right - width < r.right &&
    p.top < r.bottom &&
    p.top + 72 > r.top;

  it("右寄りで離すと、高さを保ったまま右端へ寄る", () => {
    expect(snapRoomTimer({ right: 1100, top: 330 }, 72, bounds, [])).toEqual({
      right: 1268,
      top: 330,
    });
  });
  it("左寄りで離すと、左端へ寄る", () => {
    expect(snapRoomTimer({ right: 200, top: 330 }, 72, bounds, [])).toEqual({
      right: 84,
      top: 330,
    });
  });
  it("下端の近くで離すと、横位置を保ったまま下端へ寄る", () => {
    expect(snapRoomTimer({ right: 600, top: 600 }, 72, bounds, [])).toEqual({
      right: 600,
      top: 636,
    });
  });
  it("上端の近くで離しても上中央のHUDには重ねず、その横の上端へ寄る", () => {
    const hud = { left: 400, top: 0, right: 880, bottom: 68 };
    const p = snapRoomTimer({ right: 600, top: 90 }, 72, bounds, [hud]);
    expect(overlaps(p, 72, hud)).toBe(false);
    expect(p).toEqual({ right: 388, top: 12 });
  });
  it("右端が付箋の右サイドバーで塞がれていれば、サイドバーの手前で止めずに空いている辺へ寄る", () => {
    const sidebar = { left: 1028, top: 148, right: 1268, bottom: 630 };
    const p = snapRoomTimer({ right: 900, top: 330 }, 72, bounds, [sidebar]);
    expect(overlaps(p, 72, sidebar)).toBe(false);
    expect(p).toEqual({ right: 900, top: 636 });
  });
  it("右上のHUDとサイドバーの間が空いていれば、右端のその位置に収める", () => {
    const hud = { left: 950, top: 0, right: 1268, bottom: 68 };
    const sidebar = { left: 1028, top: 164, right: 1268, bottom: 630 };
    const p = snapRoomTimer({ right: 1150, top: 120 }, 72, bounds, [
      hud,
      sidebar,
    ]);
    expect(p).toEqual({ right: 1268, top: 80 });
  });
});
