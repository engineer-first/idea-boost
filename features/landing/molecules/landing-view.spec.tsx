import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { landingCopy as copy } from "../logic/landing-copy";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

afterEach(cleanup);

it("ヒーロー・使い始め方・締めのCTAに通常開始と招待のentryの遷移先・ラベルを渡す", () => {
  const entry = getLandingEntry(false);
  const { rerender } = render(
    <LandingView locale="ja" isLoggedIn={false} entry={entry} />,
  );
  const links = screen.getAllByRole("link", { name: entry.label });
  expect(links).toHaveLength(3);
  for (const link of links) expect(link).toHaveAttribute("href", entry.href);

  const invited = getLandingEntry(false, "/invite/ABC123");
  rerender(<LandingView locale="ja" isLoggedIn={false} entry={invited} />);
  const invitedLinks = screen.getAllByRole("link", { name: invited.label });
  expect(invitedLinks).toHaveLength(3);
  for (const link of invitedLinks)
    expect(link).toHaveAttribute("href", invited.href);
  expect(screen.queryByText(copy.gettingStarted.codeHelp)).toBeNull();
});

it("通常開始の未ログインでは使い始め方に招待コードの入力場所を示す", () => {
  render(
    <LandingView
      locale="ja"
      isLoggedIn={false}
      entry={getLandingEntry(false)}
    />,
  );
  expect(screen.getByText(copy.gettingStarted.codeHelp)).toBeInTheDocument();
});

it("通常開始のヒーローでは、その場で招待コードを入力して参加できる", () => {
  const { rerender } = render(
    <LandingView
      locale="ja"
      isLoggedIn={false}
      entry={getLandingEntry(false)}
    />,
  );
  expect(
    screen.getByRole("textbox", { name: "招待コードをお持ちの方" }),
  ).toBeInTheDocument();

  rerender(
    <LandingView
      locale="ja"
      isLoggedIn={false}
      entry={getLandingEntry(false, "/invite/ABC123")}
    />,
  );
  expect(
    screen.queryByRole("textbox", { name: "招待コードをお持ちの方" }),
  ).toBeNull();
});

it("検索エンジンと AI 向けに LP の構造化データを埋め込む", () => {
  const { container } = render(
    <LandingView
      locale="ja"
      isLoggedIn={false}
      entry={getLandingEntry(false)}
    />,
  );
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  const data = JSON.parse(script?.textContent ?? "{}");
  expect(data["@context"]).toBe("https://schema.org");
  expect(
    data["@graph"].map((node: { "@type": string }) => node["@type"]),
  ).toEqual(expect.arrayContaining(["WebSite", "WebApplication", "FAQPage"]));
});

it("フッターから解説の一覧へ進める", () => {
  render(
    <LandingView
      locale="ja"
      isLoggedIn={false}
      entry={getLandingEntry(false)}
    />,
  );
  expect(
    screen.getByRole("link", { name: "アイデア出しのガイド" }),
  ).toHaveAttribute("href", "/guides");
});
