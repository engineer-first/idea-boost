// 付箋移動の計測（note-move-probe.mts）の結果を、台帳の基準（docs/loop/note-move-baseline.json）と比べる。
// 基準は場面ごとの「動かしたとおりに保存できた割合」の下限。直したら引き上げ、下げない。

export type NoteMoveBaseline = {
  scenarios: Record<string, { minLandedRate: number }>;
};
export type MeasuredScenario = {
  scenario: string;
  attempts: number;
  landed: number;
  error?: string;
};
export type BaselineGap = {
  scenario: string;
  landedRate: number;
  minLandedRate: number;
};
export type BaselineComparison = {
  /** 基準を下回った場面。原因を調べて直すか、所見にする。 */
  regressions: BaselineGap[];
  /** 1回も試せなかった、または準備に失敗した場面。合格として扱わない。 */
  inconclusive: string[];
  /** 基準を上回った場面。直した PR で基準を引き上げる候補。 */
  improved: BaselineGap[];
};

export function compareWithBaseline(
  measured: MeasuredScenario[],
  baseline: NoteMoveBaseline,
): BaselineComparison {
  const comparison: BaselineComparison = {
    regressions: [],
    inconclusive: [],
    improved: [],
  };
  for (const result of measured) {
    const expected = baseline.scenarios[result.scenario];
    if (!expected) continue;
    if (result.attempts === 0 || result.error) {
      comparison.inconclusive.push(result.scenario);
      continue;
    }
    const gap: BaselineGap = {
      scenario: result.scenario,
      landedRate: result.landed / result.attempts,
      minLandedRate: expected.minLandedRate,
    };
    if (gap.landedRate < gap.minLandedRate) comparison.regressions.push(gap);
    else if (gap.landedRate > gap.minLandedRate) comparison.improved.push(gap);
  }
  return comparison;
}
