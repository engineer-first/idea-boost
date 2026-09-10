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
  it("data-testid=home-view で描画される", () => {
    renderView();
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  it("Idea Boost タイトルは出さない（ヘッダー専用）", () => {
    renderView();
    expect(screen.queryByText("Idea Boost")).not.toBeInTheDocument();
  });

  it("案内で作成と参加の両方に触れる", () => {
    renderView();
    expect(
      screen.getByText(
        "新しいルームを作成するか、招待コードを入力して参加できます。",
      ),
    ).toBeInTheDocument();
  });

  it("Design Sprint 開始の見出しがある", () => {
    renderView();
    expect(
      screen.getByRole("heading", { name: "Design Sprintを始めましょう" }),
    ).toBeInTheDocument();
  });

  it("「ルームを作成」ボタンがある", () => {
    renderView();
    expect(
      screen.getByRole("button", { name: "ルームを作成" }),
    ).toBeInTheDocument();
  });

  it("招待コード入力フォームがある", () => {
    renderView();
    expect(screen.getByLabelText("招待コード")).toBeInTheDocument();
    expect(screen.getByTestId("join-room-form")).toBeInTheDocument();
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

  it("「ルームに参加」セクションがある", () => {
    renderView();
    const section = screen.getByTestId("home-join-room");
    expect(section).toHaveTextContent("ルームに参加");
  });
});
