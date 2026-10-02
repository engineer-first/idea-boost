// ホーム template の単体テスト。
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// CreateRoomSection / JoinRoomSection の Server Actions は描画だけでは
// 呼ばれないため、ここではモックせずそのまま import する。

import { HomeView } from "./home-view";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ rooms: [], nextCursor: null })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderView(
  overrides: Partial<React.ComponentProps<typeof HomeView>> = {},
) {
  return render(<HomeView {...overrides} />);
}

describe("HomeView", () => {
  // 作成・参加処理の成功/失敗は room-lifecycle の container spec で検証する。
  // ここではホームから両方の操作を始められることを守る。
  it("ルーム作成と招待コードによる参加の入口を同時に提供する", () => {
    renderView();
    expect(screen.getByRole("button", { name: "ルームを作成" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "招待コード" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "参加する" })).toBeDisabled();
  });

  it("error があるとき role=alert で表示する", () => {
    renderView({ error: "ルームが見つかりませんでした。" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ルームが見つかりませんでした。",
    );
  });

  it("error が無いとき alert は出ない", () => {
    renderView();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
it("以前のルームを同じ画面で繰り返し開閉しても作成・参加の入力とフォームを保持する", async () => {
  renderView();
  const name = screen.getByRole("textbox", { name: "ルーム名（任意）" });
  const code = screen.getByRole("textbox", { name: "招待コード" });
  fireEvent.change(name, { target: { value: "授業の相談" } });
  fireEvent.change(code, { target: { value: "ABC123" } });
  const summary = screen.getByText("以前のルーム").closest("summary");
  expect(summary).not.toBeNull();
  const disclosure = summary?.parentElement;
  expect(disclosure).not.toHaveAttribute("open");
  for (let i = 0; i < 3; i++) {
    fireEvent.click(summary as HTMLElement);
    expect(disclosure).toHaveAttribute("open");
    await screen.findByText("以前のルームはまだありません。");
    expect(
      screen.queryByRole("link", { name: "ホームへ" }),
    ).not.toBeInTheDocument();
    expect(name).toHaveValue("授業の相談");
    expect(code).toHaveValue("ABC123");
    expect(screen.getByRole("button", { name: "参加する" })).toBeEnabled();
    fireEvent.click(summary as HTMLElement);
    expect(disclosure).not.toHaveAttribute("open");
  }
  expect(screen.getByRole("textbox", { name: "ルーム名（任意）" })).toBe(name);
  expect(screen.getByRole("textbox", { name: "招待コード" })).toBe(code);
});
