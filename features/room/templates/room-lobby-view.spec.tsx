// スタート画面のプレゼンテーション層の単体テスト。
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { buildRoomNameControls } from "../logic/room-name.fixture";
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

  it("非ホストのときも開始ボタンが表示される", () => {
    renderView({ isHost: false });
    expect(screen.getByTestId("start-phase-button")).toBeInTheDocument();
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
    expect(
      screen
        .getAllByRole("status")
        .find((status) => status.textContent?.includes("再接続")),
    ).toHaveTextContent("再接続");
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

  it("非 host のときも招待URL/コードが出る", () => {
    renderView({
      isHost: false,
      inviteCode: "ZZ99XX",
      inviteUrl: "https://example/invite/ZZ99XX",
    });
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "招待コードをコピー" }),
    ).toBeInTheDocument();
  });
});

it("招待URLの共有は明示操作からURLだけを送る", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  try {
    renderView();
    expect(share).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "招待URLを共有" }));
    expect(share).toHaveBeenCalledExactlyOnceWith({
      url: "https://idea-flow.example/invite/AB12CD",
    });
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});

it("省略された参加者から確認を開いて取消すと一覧の入口へ戻る", async () => {
  const members = buildMembers(14, ME);
  const onTransferHost = vi.fn();
  const user = userEvent.setup();
  renderView({ members, onTransferHost });
  const overflow = screen.getByRole("button", { name: "他 3 名" });
  await user.click(overflow);
  await user.click(screen.getByRole("button", { name: members[13].name }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  await vi.waitFor(() => expect(overflow).toHaveFocus());
  expect(onTransferHost).not.toHaveBeenCalled();
});

it("参加者がロビーで選んだ成果の扱いを退出へ渡す", async () => {
  const onLeave = vi.fn();
  const user = userEvent.setup();
  renderView({ isHost: false, onLeave });
  await user.click(screen.getByRole("button", { name: "退出する" }));
  await user.click(screen.getByRole("radio", { name: "成果を残さず退出" }));
  await user.click(screen.getByRole("button", { name: "成果を残さず退出" }));
  expect(onLeave).toHaveBeenCalledWith("discard");
});

it.each([true, false])(
  "待機画面でホスト=%sも現在名を確認して変更を開ける",
  (isHost) => {
    const request = vi.fn();
    renderView({ isHost, roomName: buildRoomNameControls({ request }) });
    expect(screen.getByText("J05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ルーム名を変更" }));
    expect(request).toHaveBeenCalledOnce();
  },
);

describe("待機中のアイコン変更", () => {
  it("変更操作だけでランダム変更を要求し、保存・取消は求めない", async () => {
    const randomize = vi.fn();
    renderView({
      avatarChange: {
        randomize,
        pending: false,
        disabled: false,
        unavailable: false,
        error: null,
      },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "自分のアイコンを変更" }));
    expect(randomize).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("未使用候補がない場合は変更できない理由を表示する", () => {
    renderView({
      avatarChange: {
        randomize: vi.fn(),
        pending: false,
        disabled: true,
        unavailable: true,
        error: null,
      },
    });
    expect(
      screen.getByRole("button", { name: "自分のアイコンを変更" }),
    ).toBeDisabled();
    expect(screen.getByText(/未使用のアイコンがない/)).toBeVisible();
  });
});
