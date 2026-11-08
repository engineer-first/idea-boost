import { expect, it } from "vitest";
import {
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
it("3章の重複・欠落と長すぎる生成文を拒否する", () => {
  const response = reflectionResponseFixture();
  expect(ReflectionResponseSchema.safeParse(response).success).toBe(true);
  expect(
    ReflectionResponseSchema.safeParse({
      ...response,
      analysis: {
        ...response.analysis,
        chapters: response.analysis?.chapters.map((chapter) => ({
          ...chapter,
          headline: "",
        })),
      },
    }).success,
  ).toBe(false);
  expect(
    ReflectionResponseSchema.safeParse({
      ...response,
      analysis: {
        ...response.analysis,
        chapters: Array(3).fill(response.analysis?.chapters[0]),
      },
    }).success,
  ).toBe(false);
});
