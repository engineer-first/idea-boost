// ホーム template の単体テスト。
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/room-lifecycle/logic/room-creation-storage", () => ({
  readRoomCreationIntent: vi.fn().mockResolvedValue(null),
  listRoomCreationIntents: vi.fn().mockResolvedValue([]),
  subscribeRoomCreations: () => () => {},
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
  return render(
    <HomeView
      currentUserId="11111111-1111-4111-8111-111111111111"
      {...overrides}
    />,
  );
}

describe("HomeView", () => {
  // 作成・参加処理の成功/失敗は room-lifecycle の container spec で検証する。
  // ここではホームから両方の操作を始められることを守る。
  it("ルーム作成と招待コードによる参加の入口を同時に提供する", async () => {
    renderView();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "新しいルームを作成" }),
      ).toBeEnabled(),
    );
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
it("過去の成果はホーム内に取得せず、同じタブの専用一覧へのリンクで案内する", () => {
  renderView();
  const history = screen.getByRole("link", { name: /過去の成果を見る/ });
  expect(history).toHaveAttribute("href", "/completed-rooms");
  expect(history).not.toHaveAttribute("target", "_blank");
  expect(history).not.toHaveAttribute("aria-expanded");
  expect(
    screen.queryByRole("button", { name: "最新の一覧を取得" }),
  ).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
