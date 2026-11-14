import { expect, it } from "vitest";
import {
  ReflectionRequestSchema,
  ReflectionResearchSchema,
  ReflectionResponseSchema,
} from "./outcome-reflection";
import {
  reflectionPlanFixture,
  reflectionResponseFixture,
} from "./outcome-reflection.fixture";

it("調査・競合調査・制作物の要求を参照版で区別する", () => {
  for (const value of [
    { action: "research", revision: 0 },
    {
      action: "research",
      revision: 1,
      context: { audience: "学生", situation: "空きコマ" },
    },
    { action: "competition", revision: 0 },
    { action: "artifact", revision: 1, artifact: "質問リスト" },
  ])
    expect(ReflectionRequestSchema.safeParse(value).success).toBe(true);
});
it("版の省略・本人偽装・過長入力・異なる操作の項目混入を拒否する", () => {
  for (const value of [
    {},
    { artifact: "教材" },
    { action: "research" },
    { action: "research", revision: -1 },
    { action: "research", revision: 0, userId: "other" },
    { action: "research", revision: 0, roomId: "other" },
    {
      action: "research",
      revision: 0,
      context: { audience: "a".repeat(201), situation: "" },
    },
    { action: "competition", revision: 0, artifact: "教材" },
    { action: "artifact", revision: 0, artifact: " " },
    { action: "artifact", revision: 0, artifact: "a".repeat(201) },
  ])
    expect(ReflectionRequestSchema.safeParse(value).success).toBe(false);
});
it("追加確認は異なる不足項目2つまでに制限する", () => {
  expect(
    ReflectionResearchSchema.safeParse({
      kind: "questions",
      questions: [{ field: "audience", question: "誰の困りごとですか？" }],
    }).success,
  ).toBe(true);
  for (const questions of [
    [],
    Array(3).fill({ field: "audience", question: "誰ですか？" }),
    Array(2).fill({ field: "audience", question: "誰ですか？" }),
  ])
    expect(
      ReflectionResearchSchema.safeParse({ kind: "questions", questions })
        .success,
    ).toBe(false);
});
it("調査の実行内容・課題・観察・整理を必須にし、欠落や長すぎる生成結果を拒否する", () => {
  const plan = reflectionPlanFixture();
  expect(
    ReflectionResponseSchema.safeParse(reflectionResponseFixture()).success,
  ).toBe(true);
  for (const field of ["action", "task", "observe"])
    expect(
      ReflectionResearchSchema.safeParse({
        ...plan,
        steps: [{ ...plan.steps[0], [field]: "" }],
      }).success,
    ).toBe(false);
  for (const change of [
    { synthesis: undefined },
    { steps: [] },
    { steps: Array(7).fill(plan.steps[0]) },
    { method: "a".repeat(81) },
  ])
    expect(
      ReflectionResearchSchema.safeParse({ ...plan, ...change }).success,
    ).toBe(false);
});
