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
