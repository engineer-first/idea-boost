import type {
  ReflectionAnalysis,
  ReflectionResponse,
} from "./outcome-reflection";
export function reflectionAnalysisFixture(
  overrides: Partial<ReflectionAnalysis> = {},
): ReflectionAnalysis {
  return {
    change: {
      headline: "空きコマに、一緒に学ぶ相手を探せるようにする案だね",
      interpretation:
        "一緒に勉強する仲間が見つからない、という課題から考えた案だね。同じ空きコマの募集を見つけて参加できれば、学び合う相手を探しやすくなると考えられるよ。",
      evidenceIds: ["decision-1", "decision-2", "decision-3"],
    },
    assumption: {
      headline: "一人で過ごす理由が、相手が見つからないからか確かめたいね",
      interpretation:
        "この案が役立つには、一緒に勉強したいのに相手を探せない人がいることが大切だね。一人で休みたい場合との違いは、記録からはまだ分からないよ。ここを先に確かめると、誰を助ける案かはっきりしそうだね。",
      evidenceIds: ["decision-1", "problem-context"],
    },
    experiment: {
      headline: "最近の空きコマを、どう過ごしたか聞いてみよう",
      who: "空きコマを一人で過ごしている、使ってほしい学生に聞いてみよう。",
      steps: [
        "最近の空きコマをどう過ごしたか、具体的な一日を思い出してもらおう。",
        "誰かと勉強したかった場面と、そのとき相手を探すためにしたことを聞いてみよう。",
        "探すのを諦めた場面があれば、何が難しかったか聞いてみよう。",
      ],
      observe:
        "実際に相手を探して見つからなかった経験があるか見てみよう。「このアプリを使いたい？」という感想だけで判断しないようにしよう。",
      ifSupported:
        "相手を探して困った経験が見つかったら、募集の紙や画面を使って、相手を探せるか試してみよう。",
      ifNotSupported:
        "一人で過ごしたい理由が中心なら、助けたい人や場面を見直してみよう。少人数の反応だけで全員に当てはめないでね。",
      evidenceIds: ["decision-1", "decision-3"],
    },
    recommendation: {
      name: "聞くことのリスト",
      reason:
        "まずは実際の空きコマの過ごし方を聞けるように、質問を用意してみよう。画面を作る前に、誰がどんな場面で困っているかを確かめられるよ。",
      checks: "一緒に勉強する相手を探して、見つからずに困った経験があるか",
    },
    alternatives: ["聞いたことを残すシート", "説明するスライド"],
    sources: [
      {
        id: "decision-1",
        label: "確定した課題",
        content: "空きコマに一緒に勉強する仲間が見つからない",
        scene: null,
      },
      {
        id: "problem-context",
        label: "課題の共有付箋",
        content: "声をかけるきっかけがない",
        scene: "problem-grouping",
      },
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
