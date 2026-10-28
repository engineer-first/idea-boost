import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { InviteLoadingView } from "./invite-loading-view";

it("招待の確認中は見出しと読み上げ用の待機状態を表示する", () => {
  render(<InviteLoadingView />);
  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-busy", "true");
  expect(
    within(status).getByRole("heading", { name: "招待を確認しています" }),
  ).toBeInTheDocument();
});
