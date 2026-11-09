import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GUEST_IDENTITY_CHOICE_MESSAGE } from "../logic/guest-identity-message";
import { GuestIdentityUnavailable } from "./guest-identity-unavailable";

it.each([
  "/login?next=%2Frooms%2Froom-id&guest_next=%2Fhome",
  "/login?next=%2Frooms%2Froom-id%2Fstart%3Fentry%3Dtoken%26tab%3Dtab-id&guest_next=%2Fhome",
])("ログイン先%sがある場合は選択リンクと補足を表示する", (loginHref) => {
  render(<GuestIdentityUnavailable loginHref={loginHref} />);
  expect(screen.getByRole("link", { name: "始め方を選ぶ" })).toHaveAttribute(
    "href",
    loginHref,
  );
  expect(screen.getByText(GUEST_IDENTITY_CHOICE_MESSAGE)).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "ホームから新しく始める" }),
  ).not.toBeInTheDocument();
});

it("セッションが残る場合はログインへ戻さずホームから始める", () => {
  render(<GuestIdentityUnavailable />);
  expect(
    screen.getByRole("link", { name: "ホームから新しく始める" }),
  ).toHaveAttribute("href", "/home");
  expect(
    screen.queryByRole("link", { name: "始め方を選ぶ" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(GUEST_IDENTITY_CHOICE_MESSAGE),
  ).not.toBeInTheDocument();
});
