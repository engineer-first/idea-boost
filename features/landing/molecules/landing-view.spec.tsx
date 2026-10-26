import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

afterEach(cleanup);

it("上下CTAに通常開始と招待のentryの遷移先・ラベルを渡す", () => {
  const entry = getLandingEntry(false);
  const { rerender } = render(<LandingView isLoggedIn={false} entry={entry} />);
  const links = screen.getAllByRole("link", { name: entry.label });
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute("href", entry.href);
  expect(links[1]).toHaveAttribute("href", entry.href);

  const invited = getLandingEntry(false, "/invite/ABC123");
  rerender(<LandingView isLoggedIn={false} entry={invited} />);
  const invitedLinks = screen.getAllByRole("link", { name: invited.label });
  expect(invitedLinks).toHaveLength(2);
  expect(invitedLinks[0]).toHaveAttribute("href", invited.href);
  expect(invitedLinks[1]).toHaveAttribute("href", invited.href);
});
