// ホーム template の単体テスト。
import { render, screen, waitFor, within } from "@testing-library/react";
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
    renderView({
      error:
        "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
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

it("本人がいなくても作成カードで名前を入力でき、招待コードも入力できる", () => {
  renderView({ currentUserId: undefined });
  expect(screen.getByRole("textbox", { name: "招待コード" })).toBeEnabled();
  expect(
    within(screen.getByTestId("home-create-room")).getByRole("textbox", {
      name: "仲間に表示される名前",
    }),
  ).toBeEnabled();
});

it("本人がいない場合は過去の成果の代わりにGoogleで使っていた人のログイン入口を表示する", () => {
  renderView({ currentUserId: undefined });
  expect(
    screen.queryByRole("link", { name: "過去の成果を見る" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "Googleでログインして使っていた場合はこちら",
    }),
  ).toHaveAttribute("href", "/login?next=%2Fhome");
});

it("本人がいる場合は過去の成果を表示しGoogleのログイン補助リンクを表示しない", () => {
  renderView();
  expect(
    screen.getByRole("link", { name: "過去の成果を見る" }),
  ).toHaveAttribute("href", "/completed-rooms");
  expect(
    screen.queryByRole("link", {
      name: "Googleでログインして使っていた場合はこちら",
    }),
  ).not.toBeInTheDocument();
});

it("ゲストの連携入口より前に作成・参加の主操作と成果のリンクを配置する", async () => {
  renderView({ accountLinkStatus: "guest" });
  const link = screen.getByRole("button", {
    name: "Googleと連携して、別の端末からも記録を見返す",
  });
  for (const primary of [
    await screen.findByRole("button", { name: "新しいルームを作成" }),
    screen.getByRole("button", { name: "参加する" }),
    screen.getByRole("navigation", { name: "過去の成果" }),
  ]) {
    expect(
      primary.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
});

it("ホームの主要内容をmainランドマークから辿れる", () => {
  renderView();
  const main = screen.getByRole("main");
  expect(within(main).getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(
    within(main).getByRole("textbox", { name: "招待コード" }),
  ).toBeInTheDocument();
});
