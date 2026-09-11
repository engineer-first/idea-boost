import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomBoardHeader } from "./room-board-header";

const ME = "11111111-1111-4111-8111-111111111111";

function setupProps(
  overrides: Partial<Parameters<typeof RoomBoardHeader>[0]> = {},
) {
  return {
    hmwDecidedIssue: null,
    decidedHmw: null,
    inviteCode: "AB12CD",
    inviteUrl: "https://idea-flow.example/invite/AB12CD",
    phase: buildPhaseStep(1),
    timer: { status: "idle" } as const,
    timerServerOffsetMs: 0,
    isHost: false,
    isDisconnected: false,
    connectionStatus: "open" as const,
    members: buildMembers(2, ME),
    currentUserId: ME,
    hostUserId: ME,
    isNextPhasePending: false,
    isNextPhaseBlocked: false,
    isGuideExpanded: true,
    isSprintComplete: false,
    isLeaving: false,
    onShowVoteResult: vi.fn(),
    onGuideExpandedChange: vi.fn(),
    onLeaveClick: vi.fn(),
    onNextPhase: vi.fn(),
    onTimerStart: vi.fn(),
    onTimerPause: vi.fn(),
    onTimerResume: vi.fn(),
    onTimerExtend: vi.fn(),
    onTimerStop: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof RoomBoardHeader>[0]> = {}) {
  const props = setupProps(overrides);
  render(<RoomBoardHeader {...props} />);
  return props;
}

function openRoomMenu() {
  fireEvent.click(screen.getByRole("button", { name: "ルームメニューを開く" }));
}

describe("RoomBoardHeader", () => {
  describe("招待情報（host 限定）", () => {
    it("host は独立した招待ボタンからURLとコードを開く", () => {
      setup({ isHost: true });

      expect(screen.queryByText("招待URL")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      expect(screen.getByText("招待URL")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveTextContent("AB12CD");
    });

    it("招待ラベルの下に値を配置する", () => {
      setup({ isHost: true });
      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      const invite = screen.getByTestId("board-view-invite");
      expect(within(invite).getByText("招待URL")).toHaveClass("block");
      expect(
        within(invite).getByRole("button", { name: "招待URLをコピー" }),
      ).toHaveClass("block", "text-left");
      expect(within(invite).getByText("招待コード")).toHaveClass("block");
      expect(
        within(invite).getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveClass("block", "text-left");
    });

    it("非 host には招待情報を表示しない", () => {
      setup({ isHost: false });

      expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();
      openRoomMenu();
      expect(screen.queryByText("招待コード")).not.toBeInTheDocument();
    });
  });

  it("ルームメニューは退出操作を残し、招待情報は独立させる", () => {
    setup({ isHost: true });
    openRoomMenu();
    expect(
      screen.getByRole("button", { name: "ルームを解散" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
  });

  it("現在地をキャンバス左上のフローティングHUDに表示する", () => {
    setup({ phase: buildPhaseStep(2) });

    expect(screen.getByTestId("board-header-row")).toContainElement(
      screen.getByTestId("board-context-hud"),
    );
    expect(screen.getByTestId("board-header-row")).toContainElement(
      screen.getByTestId("board-control-hud"),
    );
    expect(screen.getByTestId("board-context-hud")).not.toHaveClass("absolute");
    expect(screen.getByText("課題整理")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "課題整理の進行状況" }),
    ).toHaveAttribute("aria-valuenow", "2");
  });

  describe("ファシリテーションガイド", () => {
    it("現在地HUDと一体で表示し、開閉操作を通知する", () => {
      const onGuideExpandedChange = vi.fn();
      setup({ isHost: true, onGuideExpandedChange });

      const toggle = screen.getByRole("button", {
        name: "進め方を閉じる",
      });
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(toggle).toHaveAttribute("aria-controls", "board-step-details");
      expect(screen.getByText("3分")).toBeInTheDocument();
      expect(screen.getByText("進行役へ")).toBeInTheDocument();

      fireEvent.click(toggle);

      expect(onGuideExpandedChange).toHaveBeenCalledWith(false);
    });

    it("参加者にはホスト限定の進行指示を表示しない", () => {
      setup({ isHost: false });

      expect(screen.getByText(/最近あった困ったこと/)).toBeInTheDocument();
      expect(screen.queryByText("進行役へ")).not.toBeInTheDocument();
    });

    it.each([
      [buildPhaseStep(1), "03"],
      [buildPhaseStep(3), "04"],
      [buildPhaseStep(2), "06"],
      [buildPhaseStep(3, 3), "07"],
      [buildPhaseStep(5), "10"],
    ] as const)("$phase の推奨$minutes分をタイマー初期値にするが自動開始しない", (phase, minutes) => {
      const onTimerStart = vi.fn();
      setup({
        isHost: true,
        phase,
        onTimerStart,
      });

      fireEvent.click(screen.getByTestId("room-timer"));

      expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue(minutes);
      expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("00");
      expect(onTimerStart).not.toHaveBeenCalled();
    });
  });

  it("折り畳んでもフェーズ名・正式なステップ名・進捗が読め、重複する見出しを省く", () => {
    const { rerender } = render(
      <RoomBoardHeader
        {...setupProps({ phase: buildPhaseStep(1), isGuideExpanded: false })}
      />,
    );
    const context = screen.getByTestId("board-context-hud");
    expect(within(context).getByText("課題整理")).toBeVisible();
    expect(within(context).getByText("自分の課題（個人）")).toBeVisible();
    expect(within(context).getByText("1/5")).toBeVisible();
    expect(within(context).queryByText("Idea Boost")).not.toBeInTheDocument();
    expect(within(context).queryByText("フェーズ1")).not.toBeInTheDocument();
    rerender(
      <RoomBoardHeader
        {...setupProps({ phase: buildPhaseStep(1, 2), isGuideExpanded: false })}
      />,
    );
    expect(within(context).getByText("問いの作成")).toBeVisible();
    expect(within(context).queryByText("課題整理")).not.toBeInTheDocument();
  });

  it("参加者・タイマー・招待・次への操作を同じ操作グループにまとめる", () => {
    setup({ isHost: true });
    const controls = screen.getByRole("group", { name: "ルームの操作" });
    expect(
      within(controls).getByRole("button", { name: "参加者 2人" }),
    ).toBeVisible();
    expect(within(controls).getByTestId("room-timer")).toBeVisible();
    expect(
      within(controls).getByRole("button", { name: "招待" }),
    ).toBeVisible();
    expect(
      within(controls).getByRole("button", { name: "次のステップへ" }),
    ).toBeVisible();
  });

  it("投票ステップでも投票パレットを上部HUDには表示しない", () => {
    setup({ phase: buildPhaseStep(4) });

    expect(
      screen.queryByRole("region", { name: "投票パレット" }),
    ).not.toBeInTheDocument();
  });

  describe("ステップ移行", () => {
    it("host のみ「次のステップへ」を表示する", () => {
      setup({ isHost: false });
      expect(
        screen.queryByRole("button", { name: "次のステップへ" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ["未接続", { isDisconnected: true }],
      ["ステップ移行 pending", { isNextPhasePending: true }],
      // 決定待ち・次ステップ未実装などのブロック判定は view 側の責務。
      ["ブロック中", { isNextPhaseBlocked: true }],
    ])("%s では「次のステップへ」が無効になる", (_label, overrides) => {
      setup({ isHost: true, ...overrides });
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeDisabled();
    });

    it("最終ステップではホストにも「次のステップへ」を表示しない", () => {
      setup({ isHost: true, phase: buildPhaseStep(5, 3) });

      expect(
        screen.queryByRole("button", { name: "次のステップへ" }),
      ).not.toBeInTheDocument();
    });

    it("最終アイデア決定後は全員に完了ステータスを表示する", () => {
      setup({
        isHost: false,
        phase: buildPhaseStep(5, 3),
        isSprintComplete: true,
      });

      expect(screen.getByRole("status")).toHaveTextContent("スプリント完了");
    });

    it("途中の結果ステップではホストに「次のステップへ」を表示する", () => {
      setup({ isHost: true, phase: buildPhaseStep(5) });

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
    });

    it("確認ダイアログの確定で onNextPhase を呼ぶ", () => {
      const onNextPhase = vi.fn();
      setup({ isHost: true, onNextPhase });

      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
      fireEvent.click(screen.getByRole("button", { name: "移行する" }));

      expect(onNextPhase).toHaveBeenCalledTimes(1);
    });
  });

  describe("接続状態の表示（loading / error / success）", () => {
    it("接続確立中は接続中の表示を出す", () => {
      setup({ connectionStatus: "connecting" });
      expect(screen.getByRole("status")).toHaveTextContent("接続中");
    });

    it("切断中は再接続中の表示を出す", () => {
      setup({ connectionStatus: "closed" });
      expect(screen.getByRole("status")).toHaveTextContent("再接続");
    });

    it("接続済みならインジケータを出さない", () => {
      setup({ connectionStatus: "open" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("投票結果ボタン（Step 1-5 限定）", () => {
    it("Step 1-5 で表示され、押下で onShowVoteResult を呼ぶ", () => {
      const onShowVoteResult = vi.fn();
      setup({ phase: buildPhaseStep(5), onShowVoteResult });

      fireEvent.click(screen.getByRole("button", { name: "投票結果を表示" }));

      expect(onShowVoteResult).toHaveBeenCalledTimes(1);
    });

    it("Step 1-5 以外では表示しない", () => {
      setup({ phase: buildPhaseStep(1) });
      expect(
        screen.queryByRole("button", { name: "投票結果を表示" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("退出・解散", () => {
    it("host は「ルームを解散」、非 host は「退出する」の文言になる", () => {
      setup({ isHost: true });
      openRoomMenu();
      expect(
        screen.getByRole("button", { name: "ルームを解散" }),
      ).toBeInTheDocument();
    });

    it("押下で onLeaveClick を呼ぶ", () => {
      const onLeaveClick = vi.fn();
      setup({ onLeaveClick });

      openRoomMenu();
      fireEvent.click(screen.getByRole("button", { name: "退出する" }));

      expect(onLeaveClick).toHaveBeenCalledTimes(1);
    });

    it("isLeaving 中はボタンが無効になり進行中の文言になる", () => {
      setup({ isLeaving: true });
      openRoomMenu();
      const button = screen.getByRole("button", { name: /退出/ });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("退出中…");
    });
  });

  it("参加者を重ねたアバターと人数に圧縮し、詳細はポップオーバーで表示する", () => {
    setup({
      timer: { status: "paused", remainingMs: 30_000, durationMs: 60_000 },
    });

    expect(
      screen.getByRole("button", { name: "参加者 2人" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
    expect(screen.getByText("Yuki Tanaka")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
  });

  it("参加者一覧はアバターのリング分の余白を確保する", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));

    expect(screen.getByRole("list")).toHaveClass("p-1");
  });
});
