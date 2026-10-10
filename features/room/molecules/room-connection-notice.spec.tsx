import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RoomConnectionNotice } from "./room-connection-notice";

it.each([
  ["auth-required", "ログインする", "/login"],
  ["unavailable", "ホームへ戻る", "/home"],
] as const)("%sでは再接続案内から回収後の入口へ切り替える", (status, name, href) => {
  render(<RoomConnectionNotice status={status} delayed />);
  expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  expect(screen.queryByText(/自動で再接続/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/コピー/);
});

it("期限切れのログイン案内は元ルームへ戻るURLを保つ", () => {
  render(
    <RoomConnectionNotice
      status="auth-required"
      returnHref="/rooms/11111111-1111-4111-8111-111111111111"
    />,
  );
  expect(screen.getByRole("link", { name: "ログインする" })).toHaveAttribute(
    "href",
    "/login?next=%2Frooms%2F11111111-1111-4111-8111-111111111111",
  );
});
