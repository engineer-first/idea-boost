import { describe, expect, it } from "vitest";
import { getRoomTimerDisplay } from "./room-timer-display";

describe("円形タイマーの表示", () => {
  it.each([
    [1, 0],
    [0.75, 90],
    [0.5, 180],
    [0.25, 270],
    [0, 360],
  ])("残り割合%sでは12時から時計回りに%s度を消す", (ratio, degrees) => {
    expect(
      getRoomTimerDisplay(
        {
          status: "running",
          endsAt: 1000 + 300000 * ratio,
          durationMs: 300000,
        },
        300000,
        1000,
      ).elapsedDegrees,
    ).toBe(degrees);
  });
  it.each([
    [1, "rgb(34, 197, 94)"],
    [0.5, "rgb(234, 179, 8)"],
    [0.2, "rgb(239, 68, 68)"],
  ])("残り割合%sを%sで表す", (ratio, color) => {
    const ratioNumber = Number(ratio);
    expect(
      getRoomTimerDisplay(
        {
          status: "running",
          endsAt: 1000 + 300000 * ratioNumber,
          durationMs: 300000,
        },
        300000,
        1000,
      ).color,
    ).toBe(color);
  });
  it("残り時間が減ると緑から黄を経て赤へ近づく", () => {
    const colorAt = (ratio: number) =>
      getRoomTimerDisplay(
        {
          status: "running",
          endsAt: 1000 + 300000 * ratio,
          durationMs: 300000,
        },
        300000,
        1000,
      ).color;

    expect(colorAt(0.75)).toBe("rgb(134, 188, 51)");
    expect(colorAt(0.25)).toBe("rgb(238, 87, 58)");
    expect(colorAt(0)).toBe("rgb(239, 68, 68)");
  });
  it("規定時間が異なっても残り割合が同じなら同じ色と面積になる", () => {
    const short = getRoomTimerDisplay(
      { status: "running", endsAt: 1000 + 90000, durationMs: 180000 },
      180000,
      1000,
    );
    const long = getRoomTimerDisplay(
      { status: "running", endsAt: 1000 + 210000, durationMs: 420000 },
      420000,
      1000,
    );
    expect(short.color).toBe(long.color);
    expect(short.elapsedDegrees).toBe(long.elapsedDegrees);
  });
});
