import { describe, expect, it } from "vitest";
import { chooseSharingReactionPosition } from "./sharing-reaction-placement";

describe("受信リアクションの出現位置", () => {
  const bounds = { left: 0, right: 420, top: 700, bottom: 780, size: 80 };
  it("乱数によって複数候補から異なる起点を選ぶ", () => {
    const first = chooseSharingReactionPosition(bounds, [], 0);
    const last = chooseSharingReactionPosition(bounds, [], 0.999);
    expect(first).toBe(0);
    expect(last).toBe(1);
  });
  it("表示中の画像と重ならない候補を優先する", () => {
    expect(
      chooseSharingReactionPosition(
        bounds,
        [{ left: 0, right: 160, top: 700, bottom: 780 }],
        0,
      ),
    ).toBeGreaterThan(0.4);
  });
  it("上へ移動済みの画像があった起点を再利用できる", () => {
    expect(
      chooseSharingReactionPosition(
        bounds,
        [{ left: 0, right: 160, top: 300, bottom: 380 }],
        0,
      ),
    ).toBe(0);
  });
  it("狭幅で全候補が重なる場合も、重なりが最小の候補を選ぶ", () => {
    expect(
      chooseSharingReactionPosition(
        { ...bounds, right: 90, size: 60 },
        [{ left: 0, right: 60, top: 700, bottom: 780 }],
        0,
      ),
    ).toBe(1);
  });
});
