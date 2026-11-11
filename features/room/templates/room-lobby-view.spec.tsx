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
      "セッションを開始",
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

  it("退出処理中にはセッションを開始できない", () => {
    renderView({ isLeaving: true });
    expect(screen.getByTestId("start-phase-button")).toBeDisabled();
  });

  it.each([
    ["connecting", "接続中"],
    ["reconnecting", "再接続中"],
    ["closed", "再接続中"],
    ["auth-required", "接続が切れました"],
    ["unavailable", "このルームは利用できません"],
  ] as const)(
    "%s になるとすぐに接続の状態を出す",
    (connectionStatus, message) => {
      renderView({ connectionStatus });
      expect(screen.getByTestId("lobby-connection-status")).toHaveTextContent(
        message,
      );
    },
  );

  it("open では接続の状態を出さない", () => {
    renderView({ connectionStatus: "open" });
    expect(
      screen.queryByTestId("lobby-connection-status"),
    ).not.toBeInTheDocument();
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

it("20人全員を表示し、参加者の除外を取消すと選んだ参加者へ戻る", async () => {
  const members = buildMembers(20, ME);
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
  expect(screen.queryByTestId("room-members-overflow")).not.toBeInTheDocument();
  for (const member of members)
    expect(screen.getByText(member.name)).toBeVisible();
  const target = screen.getByRole("button", { name: members[19].name });
  await user.click(target);
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "キャンセル" }));
  await vi.waitFor(() => expect(target).toHaveFocus());
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

describe("待機中のアイコン変更", () => {
  it("自分の顔だけを変更操作にし、名前の編集とは別に操作できる", async () => {
    const cycle = vi.fn();
    const request = vi.fn();
    const member = buildMembers(3, ME)[0];
    renderView({
      avatarChange: {
        cycle,
        pending: false,
        disabled: false,
        error: null,
      },
      displayName: {
        draft: member.name,
        onDraftChange: vi.fn(),
        open: false,
        pending: false,
        disabled: false,
        error: null,
        request,
        onOpenChange: vi.fn(),
        onConfirm: vi.fn(),
      },
    });
    const user = userEvent.setup();
    const face = screen.getByRole("button", { name: "自分のアイコンを変更" });
    expect(face).toContainElement(
      screen.getByRole("img", { name: member.name }),
    );
    await user.hover(face);
    expect(cycle).not.toHaveBeenCalled();
    await user.click(face);
    expect(cycle).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
    const name = screen.getByRole("button", {
      name: `${member.name}：表示名を変更`,
    });
    expect(name.querySelector('[data-testid="avatar"]')).toBeNull();
    name.focus();
    await user.keyboard("{Enter}");
    expect(request).toHaveBeenCalledOnce();
    expect(
      screen.getAllByRole("button", { name: "自分のアイコンを変更" }),
    ).toHaveLength(1);
  });
  it("変更操作だけで次のアイコンを要求し、保存・取消は求めない", async () => {
    const cycle = vi.fn();
    renderView({
      avatarChange: {
        cycle,
        pending: false,
        disabled: false,
        error: null,
      },
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "自分のアイコンを変更" }));
    expect(cycle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("操作できない接続ではボタンを無効にし、候補なしの説明は出さない", () => {
    renderView({
      avatarChange: {
        cycle: vi.fn(),
        pending: false,
        disabled: true,
        error: null,
      },
    });
    expect(
      screen.getByRole("button", { name: "自分のアイコンを変更" }),
    ).toBeDisabled();
    expect(
      screen.queryByText(/未使用のアイコンがない/),
    ).not.toBeInTheDocument();
  });
});
