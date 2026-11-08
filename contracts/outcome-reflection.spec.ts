import { expect, it } from "vitest";
import {
  ReflectionModelAnalysisSchema,
  ReflectionRequestSchema,
  ReflectionResponseSchema,
} from "./outcome-reflection";
import { reflectionResponseFixture } from "./outcome-reflection.fixture";

it("制作物だけを受け付け、空欄・過長入力と閲覧者の偽装を拒否する", () => {
  expect(ReflectionRequestSchema.safeParse({ artifact: "教材" }).success).toBe(
    true,
  );
  for (const value of [
    { artifact: " " },
    { artifact: "a".repeat(201) },
    { userId: "other" },
    { roomId: "other" },
  ])
    expect(ReflectionRequestSchema.safeParse(value).success).toBe(false);
});
it("目指す変化・一つの前提・観察と次の判断を含む試し方を必須にする", () => {
  const explanation = {
    headline: "一緒に過ごす相手を探せそうだね",
    interpretation: "同じ時間に空いている相手を探す案だね。",
    evidenceIds: ["decision-3"],
  };
  const analysis = {
    change: explanation,
    assumption: explanation,
    experiment: {
      headline: "最近の空きコマの過ごし方を聞いてみよう",
      who: "空きコマに一人で過ごす学生",
      steps: ["最近の空きコマをどう過ごしたか聞いてみよう。"],
      observe: "相手を探して諦めた実体験があるか見てみよう。",
      ifSupported: "相手探しの方法を小さく試してみよう。",
      ifNotSupported: "誰のどんな場面を助けたいか見直そう。",
      evidenceIds: ["decision-1"],
    },
    recommendation: null,
    alternatives: [],
  };
  expect(ReflectionModelAnalysisSchema.safeParse(analysis).success).toBe(true);
  for (const field of ["who", "observe", "ifSupported", "ifNotSupported"]) {
    expect(
      ReflectionModelAnalysisSchema.safeParse({
        ...analysis,
        experiment: { ...analysis.experiment, [field]: undefined },
      }).success,
    ).toBe(false);
  }
  expect(
    ReflectionModelAnalysisSchema.safeParse({
      ...analysis,
      assumption: undefined,
    }).success,
  ).toBe(false);
  expect(
    ReflectionModelAnalysisSchema.safeParse({
      ...analysis,
      experiment: { ...analysis.experiment, steps: [] },
    }).success,
  ).toBe(false);
});
it("説明の欠落・空の見出し・長すぎる生成文を拒否する", () => {
  const response = reflectionResponseFixture();
  expect(ReflectionResponseSchema.safeParse(response).success).toBe(true);
  for (const change of [
    undefined,
    { ...response.analysis?.change, headline: "" },
    { ...response.analysis?.change, interpretation: "あ".repeat(301) },
  ]) {
    expect(
      ReflectionResponseSchema.safeParse({
        ...response,
        analysis: { ...response.analysis, change },
      }).success,
    ).toBe(false);
  }
});
