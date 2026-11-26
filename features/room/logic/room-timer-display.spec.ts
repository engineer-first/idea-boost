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
    [300_000, "var(--ib-color-primary)"],
    [61_000, "var(--ib-color-primary)"],
    [60_000, "var(--ib-color-warning)"],
    [31_000, "var(--ib-color-warning)"],
    [30_000, "var(--ib-color-danger)"],
    [5_000, "var(--ib-color-danger)"],
  ])(
    "残り%sミリ秒の円をデザイントークン%sで塗り、残り1分・30秒の合図とそろえる",
    (remainingMs, color) => {
      expect(
        getRoomTimerDisplay(
          {
            status: "running",
            endsAt: 1000 + remainingMs,
            durationMs: 300_000,
          },
          300_000,
          1000,
        ).color,
      ).toBe(color);
    },
  );
  it("一時停止中も残り時間に応じた色を保ち、未開始は主色で満たす", () => {
    expect(
      getRoomTimerDisplay(
        { status: "paused", remainingMs: 20_000, durationMs: 300_000 },
        300_000,
        1000,
      ).color,
    ).toBe("var(--ib-color-danger)");
    expect(getRoomTimerDisplay({ status: "idle" }, 300_000, 1000).color).toBe(
      "var(--ib-color-primary)",
    );
  });
  it("設定時間が合図のしきい値以下なら、開始直後から注意の色にしない", () => {
    expect(
      getRoomTimerDisplay(
        { status: "running", endsAt: 1000 + 60_000, durationMs: 60_000 },
        60_000,
        1000,
      ).color,
    ).toBe("var(--ib-color-primary)");
  });
  it("規定時間が異なっても残り割合が同じなら同じ面積になる", () => {
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
    expect(short.elapsedDegrees).toBe(long.elapsedDegrees);
  });
});

describe("円形タイマーの残り時間の段階", () => {
  const running = (remainingMs: number, durationMs = 300_000) =>
    getRoomTimerDisplay(
      { status: "running", endsAt: 1000 + remainingMs, durationMs },
      durationMs,
      1000,
    );
  it.each([
    [61_000, "none"],
    [60_000, "minute"],
    [30_001, "minute"],
    [30_000, "half"],
    [10_001, "half"],
    [10_000, "final"],
    [1, "final"],
    [0, "none"],
  ] as const)(
    "稼働中の残り%sミリ秒は%sの段階になる",
    (remainingMs, urgency) => {
      expect(running(remainingMs).urgency).toBe(urgency);
    },
  );
  it("設定時間がしきい値以下なら、開始直後にその段階を知らせない", () => {
    expect(running(60_000, 60_000).urgency).toBe("none");
    expect(running(30_000, 60_000).urgency).toBe("half");
    expect(running(10_000, 10_000).urgency).toBe("none");
  });
  it("一時停止中・未開始は残りが少なくても段階を出さない", () => {
    expect(
      getRoomTimerDisplay(
        { status: "paused", remainingMs: 5_000, durationMs: 300_000 },
        300_000,
        1000,
      ).urgency,
    ).toBe("none");
    expect(getRoomTimerDisplay({ status: "idle" }, 5_000, 1000).urgency).toBe(
      "none",
    );
  });
});

describe("円形タイマーの設定時間", () => {
  it.each([
    ["未開始で規定3分", "3分", { status: "idle" } as const, 180_000],
    [
      "稼働中で5分",
      "5分",
      { status: "running", endsAt: 2000, durationMs: 300_000 } as const,
      0,
    ],
    [
      "一時停止中で90秒",
      "1分30秒",
      { status: "paused", remainingMs: 1000, durationMs: 90_000 } as const,
      0,
    ],
    [
      "時間切れで45秒",
      "45秒",
      { status: "ended", durationMs: 45_000 } as const,
      0,
    ],
  ])("%sの設定時間を%sと示す", (_name, label, timer, initial) => {
    expect(getRoomTimerDisplay(timer, initial, 1000).durationLabel).toBe(label);
  });
});
