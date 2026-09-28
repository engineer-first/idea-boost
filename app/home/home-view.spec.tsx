// ホーム template の単体テスト。
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// CreateRoomSection / JoinRoomSection の Server Actions は描画だけでは
// 呼ばれないため、ここではモックせずそのまま import する。

import { HomeView } from "./home-view";

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
