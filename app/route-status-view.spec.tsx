import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RouteStatusView } from "./route-status-view";

afterEach(() => {
  vi.restoreAllMocks();
});

it("トップへ戻るリンクで LP（/）へ戻れる", () => {
  render(<RouteStatusView kind="not_found" />);
  expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute(
    "href",
    "/",
  );
});

it("前の画面へ戻るを押すとブラウザの履歴を1つ戻る", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(2);
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  render(<RouteStatusView kind="error" />);
  fireEvent.click(screen.getByRole("button", { name: "前の画面へ戻る" }));
  expect(back).toHaveBeenCalledTimes(1);
});

it("リンクを直接開いて戻る履歴がないときは前の画面へ戻るを出さない", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(1);
  render(<RouteStatusView kind="not_found" />);
  expect(
    screen.queryByRole("button", { name: "前の画面へ戻る" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "トップへ戻る" })).toBeVisible();
});
