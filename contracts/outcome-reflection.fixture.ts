import type {
  ReflectionPlan,
  ReflectionResponse,
  ReflectionShared,
} from "./outcome-reflection";

export function reflectionPlanFixture(
  overrides: Partial<ReflectionPlan> = {},
): ReflectionPlan {
  return {
    kind: "plan",
    method: "最近の空きコマの実体験を聞く",
    reason:
      "一緒に勉強したいのに相手を探せず困る学生がいるか、実際の経験から確かめるためだよ。",
    steps: [
      {
        title: "最近、勉強相手を探した学生に声をかける",
        action:
          "空きコマに誰かと勉強したかった学生に、話を聞いてよいか確認しよう。",
        task: "最近、一緒に勉強する相手を探したことはありますか？",
        observe: "実際に相手を探した経験があるか。",
      },
      {
        title: "そのときの出来事を聞く",
        action: "最後に相手を探した一日を、順番に思い出してもらおう。",
        task: "どんな場面で、どうやって相手を探しましたか？",
        observe: "探すためにした行動と、難しかったこと。",
      },
      {
        title: "今の対処法と不満を聞く",
        action: "うまく見つからなかったとき、代わりに何をしたか聞いてみよう。",
        task: "その後どうしましたか？ 今の方法で困ることはありますか？",
        observe: "既存の対処法で満たされていないこと。",
      },
    ],
    synthesis:
      "実際の行動と困りごとを並べて整理しよう。相手探しに困る経験が見つかれば募集のモックで試し、別の理由が中心なら対象や場面を見直そう。少人数の意見を全員に当てはめないでね。",
    recommendation: {
      name: "質問リスト",
      reason: "アイデアへの賛否を誘導せず、最近の実体験を聞く準備に使えるよ。",
    },
    alternatives: ["記録シート", "モックアップ", "説明するスライド"],
    ...overrides,
  };
}
export function reflectionSharedFixture(
  overrides: Partial<ReflectionShared> = {},
): ReflectionShared {
  return {
    revision: 1,
    context: { audience: "学生", situation: "空きコマに勉強相手を探す" },
    result: reflectionPlanFixture(),
    sources: [
      {
        id: "decision-1",
        label: "確定した課題",
        content: "空きコマに一緒に勉強する仲間が見つからない",
        scene: null,
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
    ],
    truncated: false,
    generatedAt: 1794100000000,
    ...overrides,
  };
}
export function reflectionResponseFixture(
  overrides: Partial<ReflectionResponse> = {},
): ReflectionResponse {
  return {
    expiresAt: Date.now() + 3600000,
    shared: reflectionSharedFixture(),
    selectedArtifact: null,
    prompt: null,
    competitionPrompt: null,
    ...overrides,
  };
}
