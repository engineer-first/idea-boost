import { describe, expect, it } from "vitest";
import { compareWithBaseline } from "./note-move-baseline.mts";

const baseline = {
  scenarios: {
    solo: { minLandedRate: 1 },
    "same-note-contention": { minLandedRate: 0.4 },
    "after-peer-moved-same-note": { minLandedRate: 0 },
  },
};
const scenario = (id: string, landed: number, attempts: number) => ({
  scenario: id,
  attempts,
  landed,
});

describe("付箋移動の計測を基準と比べる", () => {
  it("基準を下回った場面を悪化として返す", () => {
    expect(
      compareWithBaseline(
        [scenario("solo", 9, 10), scenario("same-note-contention", 7, 14)],
        baseline,
      ),
    ).toMatchObject({
      regressions: [{ scenario: "solo", landedRate: 0.9, minLandedRate: 1 }],
      inconclusive: [],
    });
  });
  it("基準を満たせば悪化なしで、基準より良くなった場面を引き上げ候補として返す", () => {
    expect(
      compareWithBaseline(
        [
          scenario("solo", 10, 10),
          scenario("after-peer-moved-same-note", 10, 10),
        ],
        baseline,
      ),
    ).toEqual({
      regressions: [],
      inconclusive: [],
      improved: [
        {
          scenario: "after-peer-moved-same-note",
          landedRate: 1,
          minLandedRate: 0,
        },
      ],
    });
  });
  it("1回も試せなかった場面と準備に失敗した場面は、合格にせず計測不能として返す", () => {
    expect(
      compareWithBaseline(
        [
          scenario("solo", 0, 0),
          { ...scenario("same-note-contention", 2, 2), error: "timeout" },
        ],
        baseline,
      ),
    ).toMatchObject({
      regressions: [],
      inconclusive: ["solo", "same-note-contention"],
    });
  });
  it("基準に無い場面は比べない", () => {
    expect(
      compareWithBaseline([scenario("new-scene", 0, 5)], baseline),
    ).toEqual({ regressions: [], inconclusive: [], improved: [] });
  });
});
