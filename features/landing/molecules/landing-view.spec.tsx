import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

afterEach(cleanup);

for (const isLoggedIn of [false, true]) {
  for (const next of [
    undefined,
    "/invite/ABC123",
    "/shared-outcomes?status=confirmed",
  ]) {
    it(`上下CTAが開始文脈の遷移先を維持する: loggedIn=${isLoggedIn}, next=${next}`, () => {
      const entry = getLandingEntry(isLoggedIn, next);
      render(<LandingView isLoggedIn={isLoggedIn} entry={entry} />);
      const links = screen.getAllByRole("link", { name: entry.label });
      expect(links).toHaveLength(2);
      for (const link of links)
        expect(link).toHaveAttribute("href", entry.href);
    });
  }
}

it.each([
  ["GVの出典", "https://www.gv.com/sprint/"],
  [
    "Design Sprint Kitの事例",
    "https://designsprintkit.withgoogle.com/case-studies",
  ],
])("%sを安全な新規タブで開ける", (_name, href) => {
  render(<LandingView isLoggedIn={false} entry={getLandingEntry(false)} />);
  const link = screen
    .getAllByRole("link")
    .find((item) => item.getAttribute("href") === href);
  expect(link).toBeDefined();
  expect(link).toHaveAttribute("target", "_blank");
  expect(link?.getAttribute("rel")?.split(/\s+/)).toEqual(
    expect.arrayContaining(["noopener", "noreferrer"]),
  );
});

it("問い合わせフォームを安全な新規タブで開ける", () => {
  render(<LandingView isLoggedIn={false} entry={getLandingEntry(false)} />);
  const link = screen.getByRole("link", { name: /問い合わせ/ });
  const url = new URL(link.getAttribute("href") ?? "");
  expect(url.protocol).toBe("https:");
  expect(["forms.gle", "docs.google.com"]).toContain(url.hostname);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")?.split(/\s+/)).toEqual(
    expect.arrayContaining(["noopener", "noreferrer"]),
  );
});
