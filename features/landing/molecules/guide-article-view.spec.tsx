import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getGuide } from "../logic/guide-content";
import { GuideArticleView } from "./guide-article-view";

afterEach(cleanup);

const guide = getGuide("hackathon-idea");
if (!guide) throw new Error("hackathon-idea がない");

it("見出し・要約・各節・よくある質問・出典を本文に出す", () => {
  render(<GuideArticleView guide={guide} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    guide.heading,
  );
  expect(screen.getByText(guide.summary)).toBeInTheDocument();
  for (const section of guide.sections)
    expect(
      screen.getByRole("heading", { level: 2, name: section.heading }),
    ).toBeInTheDocument();
  for (const item of guide.faq)
    expect(screen.getByText(item.answer)).toBeInTheDocument();
  for (const source of guide.sources)
    expect(screen.getByRole("link", { name: source.label })).toHaveAttribute(
      "href",
      source.url,
    );
});

it("読み終えた人が、ログインを経てホームへ進み無料で始められる", () => {
  render(<GuideArticleView guide={guide} />);
  const start = screen.getByRole("link", { name: "無料で始める" });
  expect(start).toHaveAttribute("href", "/login?next=%2Fhome");
});

it("パンくずで LP と解説の一覧へ戻れる", () => {
  render(<GuideArticleView guide={guide} />);
  const nav = screen.getByRole("navigation", { name: "パンくずリスト" });
  expect(within(nav).getByRole("link", { name: "Idea Boost" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(within(nav).getByRole("link", { name: "ガイド" })).toHaveAttribute(
    "href",
    "/guides",
  );
});

it("検索エンジンと AI 向けに記事の構造化データを埋め込む", () => {
  const { container } = render(<GuideArticleView guide={guide} />);
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(JSON.parse(script?.textContent ?? "{}")["@graph"]).toEqual(
    expect.arrayContaining([expect.objectContaining({ "@type": "Article" })]),
  );
});
