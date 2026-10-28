import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GuestIdentityUnavailable } from "./guest-identity-unavailable";

it.each(["/rooms/room-id", "/rooms/room-id/start?entry=token&tab=tab-id"])(
  "復帰先%sをエンコードしてログインリンクへ渡し、新しく始めるリンクはホームへ戻す",
  (returnHref) => {
    render(<GuestIdentityUnavailable returnHref={returnHref} />);
    expect(
      screen.getByRole("link", { name: "Googleと連携済みの方はログイン" }),
    ).toHaveAttribute("href", `/login?next=${encodeURIComponent(returnHref)}`);
    expect(screen.getByRole("link", { name: "新しく始める" })).toHaveAttribute(
      "href",
      "/",
    );
  },
);
