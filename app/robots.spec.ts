// @vitest-environment node
// 検索エンジンに LP の場所を伝える（#1041）。
import { expect, it } from "vitest";
import robots from "./robots";

it("全体のクロールを許し、サイトマップの場所を示す", () => {
  const result = robots();
  expect(result.sitemap).toBe("https://ideaboost.dev/sitemap.xml");
  expect(result.rules).toEqual(
    expect.objectContaining({ userAgent: "*", allow: "/" }),
  );
});

it("API はクロールさせない", () => {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  expect(list.flatMap((rule) => rule.disallow ?? [])).toContain("/api/");
});
