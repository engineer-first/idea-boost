// 解説ページを検索に出し、検索エンジンと AI が記事として読めるようにする。
import { expect, it } from "vitest";
import { getGuide } from "./guide-content";
import {
  getGuideIndexMetadata,
  getGuideMetadata,
  getGuideStructuredData,
  guideUrl,
} from "./guide-metadata";

const guide = getGuide("hackathon-idea");
if (!guide) throw new Error("hackathon-idea がない");

it("解説ページは検索に出し、自身の URL を正とする", () => {
  const metadata = getGuideMetadata(guide);
  expect(metadata.title).toBe(guide.title);
  expect(metadata.description).toBe(guide.description);
  expect(metadata.robots).toEqual({ index: true, follow: true });
  expect(metadata.alternates).toEqual({
    canonical: "https://ideaboost.dev/guides/hackathon-idea",
  });
  expect(metadata.openGraph).toMatchObject({
    type: "article",
    url: "https://ideaboost.dev/guides/hackathon-idea",
    locale: "ja_JP",
  });
});

it("解説の一覧も検索に出す", () => {
  const metadata = getGuideIndexMetadata();
  expect(metadata.robots).toEqual({ index: true, follow: true });
  expect(metadata.alternates).toEqual({
    canonical: "https://ideaboost.dev/guides",
  });
});

it("記事・パンくず・よくある質問を JSON-LD で示す", () => {
  const graph = getGuideStructuredData(guide)["@graph"] as Record<
    string,
    unknown
  >[];
  const byType = (type: string) => graph.find((node) => node["@type"] === type);
  expect(byType("Article")).toMatchObject({
    headline: guide.heading,
    description: guide.description,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    inLanguage: "ja",
    mainEntityOfPage: guideUrl(guide.slug),
    publisher: { "@id": "https://ideaboost.dev/#organization" },
  });
  expect(byType("Organization")).toMatchObject({
    "@id": "https://ideaboost.dev/#organization",
    name: "Idea Boost",
  });
  expect(byType("BreadcrumbList")).toMatchObject({
    itemListElement: [
      { position: 1, item: "https://ideaboost.dev/" },
      { position: 2, item: "https://ideaboost.dev/guides" },
      { position: 3, item: guideUrl(guide.slug) },
    ],
  });
  expect(byType("FAQPage")?.mainEntity).toEqual(
    guide.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  );
});
