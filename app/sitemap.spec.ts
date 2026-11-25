// @vitest-environment node
// 検索に出す LP だけをサイトマップに載せる（#993・#1041）。
import { expect, it } from "vitest";
import sitemap from "./sitemap";

it("日本語と英語の LP だけを、互いの言語版つきで載せる", () => {
  const languages = {
    ja: "https://ideaboost.dev/",
    en: "https://ideaboost.dev/en",
    "x-default": "https://ideaboost.dev/",
  };
  expect(sitemap()).toEqual([
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
