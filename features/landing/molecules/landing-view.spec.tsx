import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { landingCopy as copy } from "../logic/landing-copy";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

afterEach(cleanup);

it("ヒーロー・使い始め方・締めのCTAに通常開始と招待のentryの遷移先・ラベルを渡す", () => {
  const entry = getLandingEntry(false);
  const { rerender } = render(<LandingView isLoggedIn={false} entry={entry} />);
  const links = screen.getAllByRole("link", { name: entry.label });
  expect(links).toHaveLength(3);
  for (const link of links) expect(link).toHaveAttribute("href", entry.href);

  const invited = getLandingEntry(false, "/invite/ABC123");
  rerender(<LandingView isLoggedIn={false} entry={invited} />);
  const invitedLinks = screen.getAllByRole("link", { name: invited.label });
  expect(invitedLinks).toHaveLength(3);
  for (const link of invitedLinks)
    expect(link).toHaveAttribute("href", invited.href);
  expect(screen.queryByText(copy.gettingStarted.codeHelp)).toBeNull();
});

it("通常開始の未ログインでは使い始め方に招待コードの入力場所を示す", () => {
  render(<LandingView isLoggedIn={false} entry={getLandingEntry(false)} />);
  expect(screen.getByText(copy.gettingStarted.codeHelp)).toBeInTheDocument();
});
