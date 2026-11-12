import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RoomConnectionNotice } from "./room-connection-notice";

function spinnerIn(element: HTMLElement): Element | null {
  return element.querySelector('[data-slot="spinner"]');
}

it("初回接続はスピナーと「接続中」だけを示し、再接続とは言わない", () => {
  render(<RoomConnectionNotice status="connecting" />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(/^接続中$/);
  expect(spinnerIn(status)).not.toBeNull();
});

it.each(["reconnecting", "closed"] as const)(
  "%s ではスピナーと「再接続中」だけを示し、待ち方の説明を出さない",
  (status) => {
    render(<RoomConnectionNotice status={status} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/^再接続中$/);
    expect(spinnerIn(notice)).not.toBeNull();
  },
);

it("利用できないルームでは短い見出しとホームへ戻る操作だけを出す", () => {
  render(<RoomConnectionNotice status="unavailable" />);
  const notice = screen.getByRole("status");
  expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute(
    "href",
    "/home",
  );
  expect(notice).toHaveTextContent(/^このルームは利用できませんホームへ戻る$/);
  expect(spinnerIn(notice)).toBeNull();
});

it("本人確認の期限切れではログインへ送らず元ルームをフルナビゲーションで再読み込みする", () => {
  const returnHref = "/rooms/11111111-1111-4111-8111-111111111111";
  render(
    <RoomConnectionNotice status="auth-required" returnHref={returnHref} />,
  );
  expect(screen.getByRole("link", { name: "再読み込み" })).toHaveAttribute(
    "href",
    returnHref,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    /^接続が切れました再読み込み$/,
  );
  expect(
    screen
      .queryAllByRole("link")
      .some((link) => link.getAttribute("href")?.startsWith("/login")),
  ).toBe(false);
});

it("戻り先がない本人確認の期限切れでは現在のページを再読み込みするリンクを出す", () => {
  render(<RoomConnectionNotice status="auth-required" />);
  const link = screen.getByRole("link", { name: "再読み込み" });
  expect(
    new URL(link.getAttribute("href") ?? "", window.location.href).href,
  ).toBe(window.location.href);
});
