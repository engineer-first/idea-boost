// スタート画面のプレゼンテーション層の単体テスト。

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { buildRoomNameControls } from "../logic/room-name.fixture";
import { useMemberRemoval } from "../logic/use-member-removal";
import { RoomLobbyView } from "./room-lobby-view";

const ME = "11111111-1111-4111-8111-111111111111";

function renderView(
  overrides: Partial<React.ComponentProps<typeof RoomLobbyView>> = {},
) {
  return render(
    <RoomLobbyView
      members={buildMembers(3, ME)}
      currentUserId={ME}
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
    renderView({});
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
    renderView({ phase: buildLobbyPhase() });
    const view = screen.getByTestId("room-lobby-view");
    expect(view).toHaveAttribute("data-phase", "lobby");
    expect(view).not.toHaveAttribute("data-host");
  });
});

describe("退出ボタン", () => {
  it("ホストは「退出する」ボタンが描画される", () => {
    renderView({});
    expect(
      screen.getByRole("button", { name: "退出する" }),
    ).toBeInTheDocument();
  });

  it("非ホストは「退出する」ボタンが描画される", () => {
    renderView({});
    expect(
      screen.getByRole("button", { name: "退出する" }),
    ).toBeInTheDocument();
  });

  it("ホストの「退出する」で確認 Dialog が開き、確定で onLeave が呼ばれる", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    renderView({ onLeave });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出する" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("退出しますか？")).toBeInTheDocument();
    await user.click(screen.getByTestId("leave-confirm-action"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」で Dialog が閉じて onLeave は呼ばれない", async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    renderView({ onLeave });
    await user.click(screen.getByRole("button", { name: "退出する" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("leave-button")).toHaveFocus(),
    );
  });

  it("isLeaving=true のときホストボタンは disabled で文言が「退出中…」", () => {
    renderView({ isLeaving: true });
    const button = screen.getByRole("button", { name: /退出/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("退出中…");
  });
});

describe("招待URL/コード（host 限定表示）", () => {
  it("非 host のときも招待URL/コードが出る", () => {
    renderView({
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
  const user = userEvent.setup();
  function Preview() {
    const memberRemoval = useMemberRemoval({
      currentUserId: ME,
      members,
      connected: true,
      blocked: false,
      send: () => true,
    });
    return (
      <RoomLobbyView
        members={members}
        currentUserId={ME}
        phase={buildLobbyPhase()}
        inviteCode="AB12CD"
        inviteUrl="https://example.test"
        connectionStatus="open"
        isStarting={false}
        onStart={vi.fn()}
        onLeave={vi.fn()}
        isLeaving={false}
        memberRemoval={memberRemoval}
      />
    );
  }
  render(<Preview />);
  const overflow = screen.getByRole("button", { name: "他 3 名" });
  await user.click(overflow);
  await user.click(screen.getByRole("button", { name: members[13].name }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  await vi.waitFor(() => expect(overflow).toHaveFocus());
});

it("参加者がロビーで成果を選ばず退出を確認できる", async () => {
  const user = userEvent.setup();
  const onLeave = vi.fn();
  renderView({ onLeave });

  await user.click(screen.getByRole("button", { name: "退出する" }));
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "退出する",
    }),
  );
  expect(onLeave).toHaveBeenCalledExactlyOnceWith();
});

it("待機画面でホスト=%sも現在名を確認して変更を開ける", () => {
  const request = vi.fn();
  renderView({ roomName: buildRoomNameControls({ request }) });
  expect(screen.getByText("J05")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ルーム名を変更" }));
  expect(request).toHaveBeenCalledOnce();
});

it.each([1, 2])(
  "退出確認に残る在籍者数に応じた説明を渡す（在籍者%s人）",
  async (count) => {
    renderView({ members: buildMembers(count, ME) });
    await userEvent.click(screen.getByRole("button", { name: "退出する" }));
    const warning = screen.queryByText(
      /退出するとルームが終了し、招待URLは使えなくなります/,
    );
    if (count === 1) expect(warning).toBeInTheDocument();
    else expect(warning).not.toBeInTheDocument();
  },
);
