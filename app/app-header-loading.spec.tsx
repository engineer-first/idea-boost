import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const gate = vi.hoisted(() => {
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { ready, finish };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("./home-user-menu", async () => {
  await gate.ready;
  return {
    HomeUserMenu: () => <button type="button">ユーザーメニュー</button>,
  };
});

import { AppHeader } from "./app-header";

it("ホームの操作を取得中もブランドと操作領域をヘッダー内に保つ", async () => {
  try {
    await act(async () => {
      render(<AppHeader userName="はな" />);
    });
    expect(screen.getByTestId("app-header-brand")).toHaveTextContent(
      "Idea Boost",
    );
    expect(screen.getByTestId("home-user-menu-placeholder")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  } finally {
    await act(async () => gate.finish());
  }
  expect(
    await screen.findByRole("button", { name: "ユーザーメニュー" }),
  ).toBeInTheDocument();
});
