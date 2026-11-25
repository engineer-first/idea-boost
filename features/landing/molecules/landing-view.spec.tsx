import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getLandingContent } from "../logic/landing-content";
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

// 手法の名前ではなく、使う前と後の変化で LP を説明する（#1128）。
describe.each([
  ["ja", "デザインスプリント"],
  ["en", "Design Sprint"],
] as const)("%s の LP の説明", (locale, methodName) => {
  const content = getLandingContent(locale).landingCopy;
  const renderLanding = () =>
    render(
      <LandingView
        locale={locale}
        isLoggedIn={false}
        entry={getLandingEntry(false)}
      />,
    );

  it("ファーストビューに使ったあとの変化の見出しと3つの約束を出す", () => {
    renderLanding();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      content.heading.join(locale === "en" ? " " : ""),
    );
    const promises = within(
      screen.getByRole("list", { name: content.promisesLabel }),
    ).getAllByRole("listitem");
    expect(promises.map((item) => item.textContent)).toEqual(content.promises);
  });

  it("「使うと、こんな時間になります」の節に6つの場面を順に並べる", () => {
    renderLanding();
    const section = screen.getByRole("region", {
      name: content.scenes.heading.join(locale === "en" ? " " : ""),
    });
    const scenes = within(section).getAllByRole("listitem");
    expect(scenes).toHaveLength(6);
    expect(
      scenes.map((scene) => scene.querySelector("h3")?.textContent),
    ).toEqual(content.scenes.items.map((item) => item.title));
  });

  it("手法の名前は考え方の背景とよくある質問にだけ出す", () => {
    const { container } = renderLanding();
    const background = screen.getByRole("region", {
      name: content.background.heading,
    });
    expect(background).toHaveTextContent(methodName);
    const faq = container.querySelector('[aria-labelledby="landing-faq"]');
    const rest = container.cloneNode(true) as HTMLElement;
    for (const id of [
      background.getAttribute("aria-labelledby"),
      "landing-faq",
    ]) {
      rest.querySelector(`[aria-labelledby="${id}"]`)?.remove();
    }
    rest.querySelector("script")?.remove();
    expect(faq).not.toBeNull();
    expect(rest.textContent).not.toContain(methodName);
  });

  it("メタの description はサブの見出しと同じ文にし、タイトルにも手法の名前を使わない", () => {
    expect(content.description).toBe(
      content.subheading.join(locale === "en" ? " " : ""),
    );
    expect(content.title).not.toContain(methodName);
  });
});
