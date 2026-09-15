// スタート画面のプレゼンテーション層の単体テスト。
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomLobbyView } from "./room-lobby-view";

const ME = "11111111-1111-4111-8111-111111111111";

function renderView(
  overrides: Partial<React.ComponentProps<typeof RoomLobbyView>> = {},
) {
  return render(
    <RoomLobbyView
      members={buildMembers(3, ME)}
      currentUserId={ME}
      isHost
      hostUserId={ME}
      phase={buildLobbyPhase()}
      inviteCode="AB12CD"
      inviteUrl="https://idea-flow.example/invite/AB12CD"
      connectionStatus="open"
      isStarting={false}
      onStart={vi.fn()}
      onLeave={vi.fn()}
      isLeaving={false}
      {...overrides}
    />,
  );
}

describe("RoomLobbyView", () => {
  it("ホストのとき「開始する」ボタンが表示される", () => {
    renderView();
    expect(screen.getByTestId("start-phase-button")).toHaveTextContent(
      "開始する",
    );
  });

  it("非ホストのときはボタンが非表示で「お待ちください」文言が出る", () => {
    renderView({ isHost: false });
    expect(screen.queryByTestId("start-phase-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("room-lobby-view-waiting")).toBeInTheDocument();
  });

  it("「開始する」クリックで onStart が呼ばれる", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    renderView({ onStart });
    await user.click(screen.getByTestId("start-phase-button"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("isStarting=true のときボタンが disabled になり文言が「開始中…」になる", () => {
    renderView({ isStarting: true });
    const button = screen.getByTestId("start-phase-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("開始中…");
  });

  it("接続が切れているときはボタンが disabled になる", () => {
    renderView({ connectionStatus: "closed" });
    expect(screen.getByTestId("start-phase-button")).toBeDisabled();
  });

  it("接続が切れているときは再接続中の表示が出る", () => {
    renderView({ connectionStatus: "closed" });
    expect(screen.getByRole("status")).toHaveTextContent("再接続");
  });

  it("メンバー数を見出しに出す", () => {
    renderView({ members: buildMembers(4, ME) });
    expect(
      screen.getByTestId("room-lobby-view-member-count"),
    ).toHaveTextContent("4 名");
  });

  it("data-phase と data-host を container がテストから参照できる形で持つ", () => {
    renderView({ phase: buildLobbyPhase(), isHost: true });
    const view = screen.getByTestId("room-lobby-view");
    expect(view).toHaveAttribute("data-phase", "lobby");
    expect(view).toHaveAttribute("data-host", "true");
  });
});

describe("退出ボタン", () => {
  it("ホストは「ルームを解散」ボタンが描画される", () => {
    renderView({ isHost: true });
    expect(
      screen.getByRole("button", { name: "ルームを解散" }),
    ).toBeInTheDocument();
  });

  it("非ホストは「退出する」ボタンが描画される", () => {
    renderView({ isHost: false });
    expect(
      screen.getByRole("button", { name: "退出する" }),
    ).toBeInTheDocument();
  });

  it("ホストの「ルームを解散」で確認 Dialog が開き、確定で onLeave が呼ばれる", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    renderView({ onLeave, isHost: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("ルームを解散しますか？")).toBeInTheDocument();
    await user.click(screen.getByTestId("leave-confirm-action"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」で Dialog が閉じて onLeave は呼ばれない", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    renderView({ onLeave, isHost: true });
    await user.click(screen.getByRole("button", { name: "ルームを解散" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("isLeaving=true のときホストボタンは disabled で文言が「解散中…」", () => {
    renderView({ isLeaving: true, isHost: true });
    const button = screen.getByRole("button", { name: /解散/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("解散中…");
  });
});

describe("招待URL/コード（host 限定表示）", () => {
  it("host のとき招待URLと招待コードのラベルと値が表示される", () => {
    renderView({
      isHost: true,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://example/invite/ZZ99XX",
    });
    expect(screen.getByText("招待URL")).toBeInTheDocument();
    expect(screen.getByText("招待コード")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toHaveTextContent("https://example/invite/ZZ99XX");
    expect(
      screen.getByRole("button", { name: "招待コードをコピー" }),
    ).toHaveTextContent("ZZ99XX");
  });

  it("非 host のとき招待URL/コードが出ない", () => {
    renderView({
      isHost: false,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://example/invite/ZZ99XX",
    });
    expect(
      screen.queryByRole("button", { name: "招待URLをコピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "招待コードをコピー" }),
    ).not.toBeInTheDocument();
  });
});
