// 検索エンジンと AI に LP の中身を構造で伝える（#1041・#1042）。
import { describe, expect, it } from "vitest";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";
import {
  getLandingStructuredData,
  serializeStructuredData,
} from "./landing-structured-data";

type Node = Record<string, unknown> & { "@type": string };

function nodeOf(locale: AppLocale, type: string): Node {
  const graph = getLandingStructuredData(locale)["@graph"] as Node[];
  const node = graph.find((item) => item["@type"] === type);
  if (!node) throw new Error(`${type} がない`);
  return node;
}

describe.each<[AppLocale, string]>([
  ["ja", "https://ideaboost.dev/"],
  ["en", "https://ideaboost.dev/en"],
])("%s の LP", (locale, url) => {
  const copy = getLandingContent(locale).landingCopy;

  it("Web アプリとして名前・説明・URL・言語・無料であることを示す", () => {
    expect(nodeOf(locale, "WebApplication")).toMatchObject({
      name: "Idea Boost",
      url,
      description: copy.description,
      inLanguage: locale,
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      featureList: copy.features.items.map((item) => item.title),
    });
  });

  it("サイト名を WebSite として示す", () => {
    expect(nodeOf(locale, "WebSite")).toMatchObject({
      name: "Idea Boost",
      url,
      inLanguage: locale,
    });
  });

  it("LP のよくある質問を、画面と同じ問いと答えで FAQPage にする", () => {
    expect(nodeOf(locale, "FAQPage").mainEntity).toEqual(
      copy.faq.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    );
  });
});

it("script 要素を閉じる文字列を含んでも HTML として壊れないよう < を逃がす", () => {
  const text = serializeStructuredData({ name: "</script><b>" });
  expect(text).not.toContain("<");
  expect(JSON.parse(text)).toEqual({ name: "</script><b>" });
});
