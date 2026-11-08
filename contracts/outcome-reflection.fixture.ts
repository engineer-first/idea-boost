import type {
  ReflectionAnalysis,
  ReflectionResponse,
} from "./outcome-reflection";
export function reflectionAnalysisFixture(
  overrides: Partial<ReflectionAnalysis> = {},
): ReflectionAnalysis {
  return {
    chapters: [
      {
        kind: "response",
        headline: "空きコマに参加できるから、仲間を探しやすそうだね",
        interpretation:
          "問いは「どうすれば気軽に学び合う仲間と出会えるか」だね。この案では、空きコマの募集を見つけて参加できるよ。予定が合う相手を探しやすくなるかもしれないね。",
        evidenceIds: ["decision-2", "decision-3"],
      },
      {
        kind: "difference",
        headline: "掲示板の案との違いは、空きコマで相手を探せることだね",
        interpretation:
          "ほかの案には「勉強仲間を募集する掲示板」があるね。今回の案は、同じ空きコマの相手を探すところが特徴と考えられるよ。なぜこの案を選んだかは、記録には書かれていないね。",
        evidenceIds: ["other"],
      },
      {
        kind: "assumptions",
        headline: "初めての相手と勉強したい人がいるか、確かめてみよう",
        interpretation:
          "この案には「短い空き時間に、初めての相手とも勉強したい人がいる」という前提がありそうだね。記録だけではまだ確かめられないので、使ってほしい人に聞いてみるとよさそうだよ。",
        evidenceIds: ["decision-3"],
      },
    ],
    recommendation: {
      name: "モックアップ",
      reason:
        "募集を探す画面と参加する画面を作れば、使い方を見せながら感想を聞けるよ。",
      checks: "募集を見た人が、迷わず参加できるか",
    },
    alternatives: ["説明するスライド", "使い方を説明する文章"],
    sources: [
      {
        id: "decision-2",
        label: "確定した問い",
        content: "どうすれば気軽に学び合う仲間と出会えるだろう？",
        scene: null,
      },
      {
        id: "decision-3",
        label: "採用したアイデア",
        content: "空きコマに学び合う仲間と出会える勉強マッチ",
        scene: null,
      },
      {
        id: "other",
        label: "保存された共有付箋",
        content: "勉強仲間を募集する掲示板",
        scene: "idea-mapping",
      },
    ],
    generatedAt: 1794100000000,
    truncated: false,
    ...overrides,
  };
}
export function reflectionResponseFixture(
  overrides: Partial<ReflectionResponse> = {},
): ReflectionResponse {
  return {
    expiresAt: Date.now() + 3600000,
    analysis: reflectionAnalysisFixture(),
    prompt: null,
    ...overrides,
  };
}
