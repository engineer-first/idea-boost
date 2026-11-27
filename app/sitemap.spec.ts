// @vitest-environment node
// 検索に出す LP と解説ページをサイトマップに載せる（#993・#1041）。
import { expect, it } from "vitest";
import sitemap from "./sitemap";

it("日本語と英語の LP を、互いの言語版つきで先頭に載せる", () => {
  const languages = {
    ja: "https://ideaboost.dev/",
    en: "https://ideaboost.dev/en",
    "x-default": "https://ideaboost.dev/",
  };
  expect(sitemap().slice(0, 2)).toEqual([
    expect.objectContaining({
      url: "https://ideaboost.dev/",
      alternates: { languages },
    }),
    expect.objectContaining({
      url: "https://ideaboost.dev/en",
      alternates: { languages },
    }),
  ]);
});

it("解説の一覧と各解説を、更新日つきで載せる", () => {
  const urls = sitemap().map((entry) => entry.url);
  expect(urls).toContain("https://ideaboost.dev/guides");
  expect(sitemap()).toContainEqual(
    expect.objectContaining({
      url: "https://ideaboost.dev/guides/hackathon-idea",
      lastModified: expect.any(String),
    }),
  );
});
