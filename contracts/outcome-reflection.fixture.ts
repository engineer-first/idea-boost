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
        headline: "思い立ったら、すぐ参加。",
        interpretation:
          "空きコマに募集へ参加できる手軽さが、学び合う仲間との出会いにつながると考えられます。",
        evidenceIds: ["decision-2", "decision-3"],
      },
      {
        kind: "difference",
        headline: "同じ時間を、出会いのきっかけに。",
        interpretation:
          "掲示板の案と比べ、同じ時間に参加できることを入口にした案だと考えられます。選ばれた理由は記録からは分かりません。",
        evidenceIds: ["other"],
      },
      {
        kind: "assumptions",
        headline: "まずは、参加するときの不安から。",
        interpretation:
          "短い空き時間でも、初めての相手と学びたい人がいるかを確かめるとよさそうです。",
        evidenceIds: ["decision-3"],
      },
    ],
    recommendation: {
      name: "利用の流れを示す画面モック",
      reason: "募集を見つけて参加するまでを具体的に見せられます。",
      checks: "初めての相手への参加に迷わないか",
    },
    alternatives: ["体験シナリオ", "説明スライド"],
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
