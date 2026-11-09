import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RoomConnectionNotice } from "./room-connection-notice";

it.each([["unavailable", "ホームへ戻る", "/home"]] as const)(
  "%sでは再接続案内から回収後の入口へ切り替える",
  (status, name, href) => {
    render(<RoomConnectionNotice status={status} delayed />);
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    expect(screen.queryByText(/自動で再接続/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/コピー/);
  },
);

it("本人確認の期限切れではログインへ送らず元ルームをフルナビゲーションで再読み込みする", () => {
  const returnHref = "/rooms/11111111-1111-4111-8111-111111111111";
  render(
    <RoomConnectionNotice status="auth-required" returnHref={returnHref} />,
  );
  expect(
    screen.getByRole("link", { name: "再読み込みして続ける" }),
  ).toHaveAttribute("href", returnHref);
  expect(screen.getByRole("status")).toHaveTextContent("接続を止めました");
  expect(screen.getByRole("status")).toHaveTextContent(
    "本人確認の期限が切れたため、操作と更新を止めています。",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    /確認・コピーしてから再読み込み/,
  );
  expect(
    screen.queryByRole("link", { name: "ログインする" }),
  ).not.toBeInTheDocument();
  expect(
    screen
      .queryAllByRole("link")
      .some((link) => link.getAttribute("href")?.startsWith("/login")),
  ).toBe(false);
});
it("戻り先がない本人確認の期限切れでは現在のページを再読み込みするリンクを出す", () => {
  render(<RoomConnectionNotice status="auth-required" />);
  const link = screen.getByRole("link", { name: "再読み込みして続ける" });
  expect(
    new URL(link.getAttribute("href") ?? "", window.location.href).href,
  ).toBe(window.location.href);
});

it("初回接続と時間のかかる初回接続は再接続と表示しない", () => {
  const { rerender } = render(<RoomConnectionNotice status="connecting" />);
  expect(screen.queryByText(/再接続/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("接続しています");
  rerender(<RoomConnectionNotice status="connecting" delayed />);
  expect(screen.queryByText(/再接続|接続が戻って/)).not.toBeInTheDocument();
});
