import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildMembers,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import * as facilitationGuide from "../logic/facilitation-guide";
import { RoomBoardHeader } from "./room-board-header";
import styles from "./room-board-header.module.css";

const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  sessionStorage.setItem(`step-onboarding:AB12CD:${ME}:1-1`, "seen");
});

function allReadyProgress(members: ReturnType<typeof buildMembers>) {
  return {
    phaseRevision: 1,
    progressRevision: 2,
    connectedUserIds: members.map(({ userId }) => userId),
    readyUserIds: members.map(({ userId }) => userId),
    notReadyUserIds: [],
    canAdvance: true,
    allReady: true,
  };
}

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
    isNextPhaseBlocked: false as const,
    hasFinalDecision: false,
    outcomePublished: false,
    onPublishOutcome: vi.fn(),
    isLeaving: false,

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

async function advanceOnboardingSlide() {
  const dialog = screen.getByRole("dialog");
  const currentTitle = within(dialog).getByRole("heading").textContent ?? "";
  const slideContent = screen.getByTestId("step-one-onboarding-slide-content");
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  expect(slideContent).toHaveAttribute("data-slide-transition", "out");
  expect(within(dialog).getByRole("heading")).toHaveTextContent(currentTitle);
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "in"),
  );
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "idle"),
  );
}

async function returnToOnboardingSlide(index: number, title: string) {
  const slideContent = screen.getByTestId("step-one-onboarding-slide-content");
  fireEvent.click(
    screen.getByRole("button", { name: `${index + 1}枚目に戻る` }),
  );
  expect(slideContent).toHaveAttribute("data-slide-transition", "out");
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "in"),
  );
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "idle"),
  );
  expect(screen.getByRole("dialog", { name: title })).toBeVisible();
}

describe("RoomBoardHeader", () => {
  it("1-1以外は進め方ガイドを表示せず、規定時間で自動開始する", async () => {
    const props = setup({ phase: buildPhaseStep(3), isHost: true });
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(props.onTimerStart).toHaveBeenCalledWith(240_000),
    );
  });
  it("ホスト不在なら接続中の参加者が案内終了後に規定時間で自動開始する", async () => {
    const props = setupProps({
      phase: buildPhaseStep(3),
      hostUserId: "33333333-3333-4333-8333-333333333333",
      progress: {
        ...allReadyProgress(buildMembers(1, ME)),
        readyUserIds: [],
        allReady: false,
        canAdvance: false,
      },
    });
    render(<RoomBoardHeader {...props} />);
    await waitFor(() =>
      expect(props.onTimerStart).toHaveBeenCalledExactlyOnceWith(240_000),
    );
  });
  it("案内終了後にホストが切断しても代表参加者だけが開始を引き継ぐ", async () => {
    const hostUserId = "33333333-3333-4333-8333-333333333333";
    const members = buildMembers(2, ME);
    const progress = {
      ...allReadyProgress(members),
      connectedUserIds: [hostUserId, ME],
      readyUserIds: [],
      allReady: false,
      canAdvance: false,
    };
    const props = setupProps({
      phase: buildPhaseStep(3),
      hostUserId,
      progress,
    });
    const view = render(<RoomBoardHeader {...props} />);
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    expect(props.onTimerStart).not.toHaveBeenCalled();
    view.rerender(
      <RoomBoardHeader
        {...props}
        progress={{ ...progress, connectedUserIds: [ME] }}
      />,
    );
    await waitFor(() =>
      expect(props.onTimerStart).toHaveBeenCalledExactlyOnceWith(240_000),
    );
    view.rerender(
      <RoomBoardHeader
        {...props}
        progress={{ ...progress, connectedUserIds: [ME], progressRevision: 3 }}
      />,
    );
    expect(props.onTimerStart).toHaveBeenCalledTimes(1);
  });
  it("ホスト不在でも別の参加者が開始担当なら自動開始を送らない", async () => {
    const props = setupProps({
      phase: buildPhaseStep(3),
      hostUserId: "33333333-3333-4333-8333-333333333333",
      progress: {
        ...allReadyProgress(buildMembers(2, ME)),
        connectedUserIds: [ME, "00000000-0000-4000-8000-000000000000"],
      },
    });
    render(<RoomBoardHeader {...props} />);
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    expect(props.onTimerStart).not.toHaveBeenCalled();
  });
  it("規定時間の案内を変更すると未開始の表示と手動開始も同じ時間になる", () => {
    const guide = facilitationGuide.getFacilitationGuide(buildPhaseStep(3));
    if (!guide) throw new Error("工程の案内がありません");
    const spy = vi
      .spyOn(facilitationGuide, "getFacilitationGuide")
      .mockReturnValue({ ...guide, durationMinutes: 9 });
    try {
      const props = setup({
        phase: buildPhaseStep(3),
      });
      expect(screen.getByRole("timer")).toHaveTextContent("09:00");
      fireEvent.click(screen.getByTestId("room-timer"));
      expect(props.onTimerStart).toHaveBeenCalledWith(540_000);
    } finally {
      spy.mockRestore();
    }
  });
  it("共有中は発表者の完了で即時交代し、独立した交代ボタンを表示しない", () => {
    const props = setup({
      phase: buildPhaseStep(2),
      sharing: buildSharingState({ status: "active", currentIndex: 0 }),
      timer: {
        status: "running",
        durationMs: 180_000,
        endsAt: Date.now() + 180_000,
      },
      onToggleReady: vi.fn(),
      onSharingAdvance: vi.fn(),
    });
    fireEvent.click(screen.getByRole("button", { name: "できた！" }));
    expect(props.onSharingAdvance).toHaveBeenCalledExactlyOnceWith("done");
    expect(props.onToggleReady).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: /次の人へ|共有を終える|次のステップへ/,
      }),
    ).not.toBeInTheDocument();
  });
  it("発表待ちの参加者は共有の完了を押せない", () => {
    setup({
      phase: buildPhaseStep(2),
      sharing: buildSharingState({ status: "active", currentIndex: 1 }),
      timer: { status: "ended", durationMs: 180_000 },
      onToggleReady: vi.fn(),
      onSharingAdvance: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
  });
  it("投票工程では時間切れでも投票が未完了なら次に進めない", () => {
    const members = buildMembers(2, ME);
    const props = setupProps({
      phase: buildPhaseStep(4),
      members,
      progress: {
        ...allReadyProgress(members),
        readyUserIds: [],
        notReadyUserIds: members.map(({ userId }) => userId),
        allReady: false,
      },
      completedVoterIds: [members[0].userId],
      timer: { status: "ended", durationMs: 300_000 },
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeDisabled();
    rerender(
      <RoomBoardHeader
        {...props}
        completedVoterIds={members.map(({ userId }) => userId)}
      />,
    );
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
  });
  it("最終成果の公開も全員のチェックか時間切れを待つ", () => {
    const members = buildMembers(2, ME);
    const partial = {
      ...allReadyProgress(members),
      readyUserIds: [members[0].userId],
      notReadyUserIds: [members[1].userId],
      allReady: false,
    };
    const props = setupProps({
      phase: buildPhaseStep(5, 3),
      hasFinalDecision: true,
      members,
      progress: partial,
      timer: {
        status: "running",
        durationMs: 300_000,
        endsAt: Date.now() + 300_000,
      },
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    expect(
      screen.getByRole("button", { name: "完了して成果を表示" }),
    ).toBeDisabled();
    rerender(
      <RoomBoardHeader {...props} progress={allReadyProgress(members)} />,
    );
    expect(
      screen.getByRole("button", { name: "完了して成果を表示" }),
    ).toBeEnabled();
    rerender(
      <RoomBoardHeader
        {...props}
        timer={{ status: "ended", durationMs: 300_000 }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "完了して成果を表示" }),
    ).toBeEnabled();
  });
  it("成果公開が切断中に無効なときは強調しない", () => {
    setup({
      phase: buildPhaseStep(5, 3),
      hasFinalDecision: true,
      timer: { status: "ended", durationMs: 300_000 },
      isDisconnected: true,
    });
    const button = screen.getByRole("button", { name: "完了して成果を表示" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveClass(styles.nextReady);
  });
  it("時間切れ後の確認中に延長されたら、未完了のまま進行を確定できない", () => {
    const members = buildMembers(2, ME);
    const props = setupProps({
      members,
      progress: {
        ...allReadyProgress(members),
        readyUserIds: [members[0].userId],
        notReadyUserIds: [members[1].userId],
        allReady: false,
      },
      timer: { status: "ended", durationMs: 300_000 },
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    rerender(
      <RoomBoardHeader
        {...props}
        timer={{
          status: "running",
          durationMs: 60_000,
          endsAt: Date.now() + 60_000,
          extensionUsed: true,
        }}
      />,
    );
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "次へ進む",
      }),
    ).toBeDisabled();
  });
  it("タイマー稼働中は全員のチェック、時間切れ後は未チェックでも次へ進める", () => {
    const members = buildMembers(2, ME);
    const partial = {
      ...allReadyProgress(members),
      readyUserIds: [members[0].userId],
      notReadyUserIds: [members[1].userId],
      allReady: false,
    };
    const props = setupProps({
      members,
      progress: partial,
      onToggleReady: vi.fn(),
      timer: {
        status: "running",
        durationMs: 300_000,
        endsAt: Date.now() + 300_000,
      },
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    const next = () =>
      within(screen.getByTestId("board-control-hud")).getByRole("button", {
        name: "次のステップへ",
      });
    expect(next()).toBeDisabled();
    rerender(
      <RoomBoardHeader {...props} progress={allReadyProgress(members)} />,
    );
    expect(next()).toBeEnabled();
    rerender(
      <RoomBoardHeader
        {...props}
        timer={{ status: "ended", durationMs: 300_000 }}
      />,
    );
    expect(next()).toBeEnabled();
  });
  it.each(
    [true, false].flatMap((isHost) =>
      [1, 3, 4].map((step) => ({ isHost, step })),
    ),
  )(
    "step=$step / isHost=$isHost : 最初から全員完了ならワンクリックで進み、確認ダイアログを開かない",
    ({ isHost, step }) => {
      const members = buildMembers(3, ME);
      const props = setup({
        isHost,
        phase: buildPhaseStep(step),
        members,
        completedVoterIds: members.map(({ userId }) => userId),
        progress: allReadyProgress(members),
      });

      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

      expect(props.onNextPhase).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    },
  );

  it.each([true, false])(
    "isHost=%sで確認中に全員が完了してもダイアログを維持し、最新の完了状態で進む",
    (isHost) => {
      const members = buildMembers(3, ME);
      const props = setupProps({
        isHost,
        members,
        timer: { status: "ended", durationMs: 300_000 },
        progress: {
          ...allReadyProgress(members),
          readyUserIds: members.slice(0, 2).map(({ userId }) => userId),
          notReadyUserIds: [members[2].userId],
          allReady: false,
        },
      });
      const { rerender } = render(<RoomBoardHeader {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent(
        members[2].name,
      );

      rerender(
        <RoomBoardHeader
          {...props}
          progress={{ ...allReadyProgress(members), progressRevision: 3 }}
        />,
      );

      expect(
        screen.getByRole("alertdialog", { name: "全員が完了しました" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("group", { name: "未完了のメンバー" }),
      ).toBeNull();
      expect(props.onNextPhase).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "次へ進む" }));
      expect(props.onNextPhase).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(screen.queryByRole("alertdialog")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
      expect(props.onNextPhase).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    },
  );

  it.each([4, 5])(
    "3-%iも問いと課題を畳んだ共通のマップ用参照欄を使う",
    (step) => {
      setup({
        phase: buildPhaseStep(step, 3),
        decidedHmw: "どうすれば全員が参加できるだろうか？",
        hmwDecidedIssue: "発言する人が偏る",
      });

      const question = screen.getByRole("button", { name: "決定した問い" });
      const issue = screen.getByRole("button", { name: "決定した課題" });
      expect(question).toHaveAttribute("aria-expanded", "false");
      expect(issue).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(question);
      expect(
        screen.getByTestId("board-reference-hmw-popover"),
      ).toHaveTextContent("どうすれば全員が参加できるだろうか？");
      fireEvent.click(issue);
      expect(question).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.getByTestId("board-reference-issue-popover"),
      ).toHaveTextContent("発言する人が偏る");
    },
  );

  it("3-2と3-3で同じマップ用ヘッダー配置を使う", () => {
    setup({ phase: buildPhaseStep(2, 3) });
    expect(screen.getByTestId("board-header-row")).toHaveAttribute(
      "data-map-workspace",
      "true",
    );
  });

  it("1-1の初回に3枚の説明スライドを順に表示し、最後の「はじめる」で閉じる", async () => {
    const inviteCode = "ONBOARD1";
    sessionStorage.removeItem(`step-onboarding:${inviteCode}:${ME}:1-1`);
    const props = setupProps({ inviteCode, isHost: true });
    const { rerender } = render(
      <RoomBoardHeader {...props} phase={buildPhaseStep(1, 1)} />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();
    expect(screen.queryByText("工程 1-1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "1枚目 / 全3枚" }),
    ).toBeVisible();

    await advanceOnboardingSlide();
    expect(
      await screen.findByRole("dialog", {
        name: "1枚に1つ、困ったことを書こう。",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("listitem", { name: "2枚目 / 全3枚" }),
    ).toBeVisible();
    expect(
      screen.getByText(/話題が変わったら、別の付箋に書きましょう/),
    ).toBeVisible();
    const operationVideo = screen.getByLabelText("付箋を追加して書き出す操作");
    expect(operationVideo).toHaveAttribute(
      "src",
      "/onboarding/operation-guide-placeholder.webm",
    );
    expect(operationVideo).toHaveProperty("autoplay", true);
    expect(operationVideo).toHaveProperty("loop", true);
    expect(operationVideo).toHaveProperty("muted", true);
    expect(operationVideo).toHaveProperty("playsInline", true);

    await advanceOnboardingSlide();
    expect(
      await screen.findByRole("dialog", {
        name: "タイマーの時間内にできるだけ多く書き出そう",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("listitem", { name: "3枚目 / 全3枚" }),
    ).toBeVisible();
    const dialog = screen.getByRole("dialog");
    const guideButton = screen.getByTestId("step-one-onboarding-trigger");
    if (!guideButton) throw new Error("進め方ボタンが見つかりません");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 64, 800, 500),
    );
    vi.spyOn(guideButton, "getBoundingClientRect").mockReturnValue(
      new DOMRect(350, 0, 100, 36),
    );
    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(dialog).toHaveAttribute("data-closing-to-guide", "true");
    expect(dialog.style.getPropertyValue("--guide-target-x")).toBe("0px");
    expect(dialog.style.getPropertyValue("--guide-target-y")).toBe("-296px");
    expect(dialog).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(props.onTimerStart).toHaveBeenCalledWith(300000);
    rerender(<RoomBoardHeader {...props} phase={buildPhaseStep(1, 1)} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("1-1の「進め方」から初回表示後の説明スライドを再度開ける", async () => {
    const inviteCode = "MANUAL1";
    sessionStorage.setItem(`step-onboarding:${inviteCode}:${ME}:1-1`, "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    const openGuide = screen.getByRole("button", { name: "進め方" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(openGuide);
    expect(
      await screen.findByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();

    await advanceOnboardingSlide();
    await advanceOnboardingSlide();
    expect(
      screen.getByRole("dialog", {
        name: "タイマーの時間内にできるだけ多く書き出そう",
      }),
    ).toBeVisible();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    expect(dialog).toHaveAttribute("data-closing-to-guide", "true");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(openGuide);
    expect(
      await screen.findByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();
  });

  it("スライドの進捗から前のスライドへ戻れる", async () => {
    const inviteCode = "ONBOARD-BACK";
    sessionStorage.setItem(`step-onboarding:${inviteCode}:${ME}:1-1`, "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });
    await advanceOnboardingSlide();
    await advanceOnboardingSlide();

    await returnToOnboardingSlide(
      0,
      "最近あった困ったことを付箋に書き出そう。",
    );
    expect(
      screen.getByRole("listitem", { name: "1枚目 / 全3枚" }),
    ).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "次へ" })).toBeVisible();
  });

  it("スライドの進捗表示はドット列の幅を保つ", async () => {
    const inviteCode = "ONBOARD-PROGRESS-WIDTH";
    sessionStorage.setItem(`step-onboarding:${inviteCode}:${ME}:1-1`, "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });

    const progressButtons = screen.getAllByRole("button", {
      name: /枚目に戻る/,
    });
    expect(progressButtons).toHaveLength(3);
    for (const button of progressButtons) {
      expect(button).toHaveClass("w-fit");
      expect(button).not.toHaveClass("w-8");
    }
  });

  it("アニメーション終了を受け取れない環境でもスライドを長く隠さない", async () => {
    const inviteCode = "ONBOARD-QUICK";
    sessionStorage.setItem(`step-onboarding:${inviteCode}:${ME}:1-1`, "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "次へ" }));
      await act(async () => {
        vi.advanceTimersByTime(235);
      });

      expect(
        screen.getByTestId("step-one-onboarding-slide-content"),
      ).toHaveAttribute("data-slide-transition", "in");
    } finally {
      vi.useRealTimers();
    }
  });

  it("はじめるのモーションが終わった時点でスライドを閉じる", async () => {
    const inviteCode = "ONBOARD-CLOSE";
    sessionStorage.setItem(`step-onboarding:${inviteCode}:${ME}:1-1`, "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });
    await advanceOnboardingSlide();
    await advanceOnboardingSlide();

    const dialog = screen.getByRole("dialog");
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
      await act(async () => {
        vi.advanceTimersByTime(380);
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(dialog).toHaveStyle({ animation: "none", opacity: "0" });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["1-2", 2, 1],
    ["1-3", 3, 1],
    ["1-4", 4, 1],
    ["1-5", 5, 1],
    ["2-1", 1, 2],
    ["3-1", 1, 3],
    ["3-2", 2, 3],
    ["3-3", 3, 3],
  ] as const)("初回説明スライドは%sでは表示しない", (label, step, phase) => {
    setup({
      inviteCode: `ONBOARD-${label}`,
      phase: buildPhaseStep(step, phase),
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("初回の個人作業ではスライド案内を使い、ガイドを重ねない", () => {
    setup({ phase: buildPhaseStep(1) });

    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("step-one-onboarding-trigger")).toBeVisible();
  });

  it("3-3でも共通の現在地・参照情報・ルーム操作を表示する", () => {
    setup({
      phase: buildPhaseStep(3, 3),
      decidedHmw: "どうすれば最初の一歩を踏み出せるだろうか？",
      hmwDecidedIssue: "作業を後回しにしてしまう",
    });

    expect(screen.getByRole("button", { name: /現在地/ })).toHaveTextContent(
      "③アイデア｜2軸評価",
    );
    expect(screen.getByTestId("board-control-hud")).toBeVisible();
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    const question = screen.getByRole("button", { name: /決定した問い/ });
    expect(question).toHaveAttribute("aria-expanded", "false");
    expect(question).toHaveTextContent("決定した問い");
    fireEvent.click(question);
    expect(screen.getByLabelText("決定した問いの本文")).toHaveTextContent(
      "どうすれば最初の一歩を踏み出せるだろうか？",
    );
    const issue = screen.getByRole("button", { name: /決定した課題/ });
    expect(issue).toHaveTextContent("決定した課題");
    fireEvent.click(issue);
    expect(screen.getByLabelText("決定した課題の本文")).toHaveTextContent(
      "作業を後回しにしてしまう",
    );
  });

  describe("招待情報（host 限定）", () => {
    it("host はルームメニューの招待からURLとコードを開く", () => {
      setup({ isHost: true });

      expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();

      openRoomMenu();
      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      expect(screen.getByText("招待URL")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveTextContent("AB12CD");
    });

    it("招待ラベルの下に値を配置する", () => {
      setup({ isHost: true });
      openRoomMenu();
      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      const invite = screen.getByTestId("board-view-invite");
      expect(within(invite).getByText("招待URL")).toHaveClass("block");
      expect(
        within(invite).getByRole("button", { name: "招待URLをコピー" }),
      ).toHaveClass("w-full", "text-left");
      expect(within(invite).getByText("招待コード")).toHaveClass("block");
      expect(
        within(invite).getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveClass("w-full", "text-left");
    });

    it("参加者にも招待情報を表示する", () => {
      setup({ isHost: false });

      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();
      openRoomMenu();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("招待コード")).not.toBeInTheDocument();
    });
  });

  it("ルームメニューは招待と退出操作を表示する", () => {
    setup({ isHost: true });
    openRoomMenu();
    expect(screen.getByRole("button", { name: "招待" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ルームを解散" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
  });

  it("ボードがpointerdownの伝播を止めても外側クリックで閉じ、元のクリックを通す", () => {
    const onOutsideClick = vi.fn();
    render(
      <div onPointerDownCapture={(event) => event.stopPropagation()}>
        <RoomBoardHeader {...setupProps({ isHost: true })} />
        <button type="button" onClick={onOutsideClick}>
          ボードの外側操作
        </button>
      </div>,
    );
    openRoomMenu();
    const menu = screen.getByRole("dialog", { name: "ルームメニュー" });
    fireEvent.pointerDown(menu, { button: 0, pointerId: 1 });
    expect(menu).toBeInTheDocument();
    const outside = screen.getByRole("button", { name: "ボードの外側操作" });
    fireEvent.pointerDown(outside, { button: 0, pointerId: 2 });
    fireEvent.pointerUp(outside, { button: 0, pointerId: 2 });
    fireEvent.click(outside);
    expect(
      screen.queryByRole("dialog", { name: "ルームメニュー" }),
    ).not.toBeInTheDocument();
    expect(onOutsideClick).toHaveBeenCalledOnce();
    openRoomMenu();
    expect(
      screen.getByRole("dialog", { name: "ルームメニュー" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "ルームメニュー" }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /現在地/ })).toHaveTextContent(
      "①課題｜共有",
    );
    expect(screen.queryByText("2/5")).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "全工程の現在地" }),
    ).toHaveAttribute("aria-valuenow", "2");
  });

  it("狭い画面では進行HUDの幅を守り、操作HUDを折り返せる", () => {
    setup({ phase: buildPhaseStep(5) });

    expect(screen.getByTestId("board-header-row")).toHaveClass(
      "max-[900px]:grid-cols-[306px_minmax(0,1fr)]",
    );
    expect(screen.getByTestId("board-context-column")).toHaveClass(
      "max-[900px]:min-w-[306px]",
    );
    expect(screen.getByTestId("board-control-hud")).toHaveClass(
      "max-[900px]:max-w-[426px]",
      "max-[900px]:flex-wrap",
    );
    expect(screen.getByRole("button", { name: "参加者 2人" })).toHaveClass(
      "max-[900px]:w-[52px]",
    );
  });

  it.each([
    [buildPhaseStep(3, 1), 1, "課題"],
    [buildPhaseStep(2, 2), 2, "問い"],
    [buildPhaseStep(4, 3), 3, "アイデア"],
  ] as const)(
    "開くと3フェーズの手順タブを確認でき、閉じた表示に進捗を残す",
    (phase, currentPhaseNumber, currentPhaseLabel) => {
      setup({ phase });

      fireEvent.click(screen.getByRole("button", { name: /現在地/ }));
      const phaseProgress = screen.getByTestId("board-phase-progress");
      expect(phaseProgress).toHaveAttribute(
        "aria-label",
        "3つのフェーズの手順",
      );
      expect(
        within(phaseProgress).getByRole("tab", { name: /課題/ }),
      ).toBeVisible();
      expect(
        within(phaseProgress).getByRole("tab", { name: /問い/ }),
      ).toBeVisible();
      expect(
        within(phaseProgress).getByRole("tab", { name: /アイデア/ }),
      ).toBeVisible();
      const currentPhase = within(phaseProgress).getByTestId(
        `board-phase-${currentPhaseNumber}`,
      );
      expect(currentPhase).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("button", { name: /現在地/ })).toHaveTextContent(
        currentPhaseLabel,
      );

      const progressRail = screen.getByTestId("board-progress-rail");
      expect(progressRail).toHaveAttribute("aria-valuemax", "14");
      expect(screen.getByTestId("board-current-step")).toBeVisible();
    },
  );

  it("現在フェーズ以外も完了・未着手の状態を形と色で区別する", () => {
    setup({ phase: buildPhaseStep(1, 2) });
    fireEvent.click(screen.getByRole("button", { name: /現在地/ }));

    expect(screen.getByTestId("board-phase-1")).toHaveAttribute(
      "data-phase-state",
      "completed",
    );
    expect(screen.getByTestId("board-phase-2")).toHaveAttribute(
      "data-phase-state",
      "current",
    );
    expect(screen.getByTestId("board-phase-3")).toHaveAttribute(
      "data-phase-state",
      "upcoming",
    );
  });

  it("Phase 2 Step 1の現在ステップ名は契約の正式名称を表示する", () => {
    setup({ phase: buildPhaseStep(1, 2) });
    fireEvent.click(screen.getByRole("button", { name: /現在地/ }));

    expect(screen.getByTestId("board-current-step")).toHaveTextContent(
      "課題に対する問い（個人）",
    );
  });

  describe("タイマー推奨時間", () => {
    it.each([
      [buildPhaseStep(1), "05"],
      [buildPhaseStep(3), "04"],
      [buildPhaseStep(2), "06"],
      [buildPhaseStep(1, 3), "05"],
      [buildPhaseStep(3, 3), "07"],
      [buildPhaseStep(5), "10"],
    ] as const)(
      "$phase の推奨$minutes分をタイマー初期値にする",
      (phase, minutes) => {
        const onTimerStart = vi.fn();
        const inviteCode = `TIMER-DURATION-${JSON.stringify(phase)}`;
        sessionStorage.setItem(
          `step-onboarding:${inviteCode}:${ME}:1-1`,
          "seen",
        );
        setup({
          inviteCode,
          isHost: true,
          phase,
          onTimerStart,
        });

        expect(screen.getByRole("timer")).toHaveTextContent(`${minutes}:00`);
      },
    );
  });

  it("折り畳んでもフェーズ名・番号・進捗が読め、概要から正式名を確認できる", () => {
    const { rerender } = render(
      <RoomBoardHeader
        {...setupProps({
          phase: buildPhaseStep(1),
        })}
      />,
    );
    const context = screen.getByTestId("board-context-hud");
    expect(
      within(context).getByRole("button", { name: /現在地/ }),
    ).toHaveTextContent("①課題｜個人");
    expect(
      within(context).queryByText("自分の課題（個人）"),
    ).not.toBeInTheDocument();
    expect(within(context).queryByText("1/5")).not.toBeInTheDocument();
    const progress = within(context).getByRole("progressbar", {
      name: "全工程の現在地",
    });
    expect(progress).toBeVisible();
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(within(context).queryByText("Idea Boost")).not.toBeInTheDocument();
    expect(within(context).queryByText("フェーズ1")).not.toBeInTheDocument();
    rerender(
      <RoomBoardHeader
        {...setupProps({
          phase: buildPhaseStep(1, 2),
        })}
      />,
    );
    expect(
      within(context).getByRole("button", { name: /現在地/ }),
    ).toHaveTextContent("②問い｜個人");
    fireEvent.click(within(context).getByRole("button", { name: /現在地/ }));
    expect(within(context).getByTestId("board-phase-1")).toHaveAttribute(
      "data-phase-state",
      "completed",
    );
  });

  it("タイマーを操作HUDから独立したフローティング表示にする", () => {
    setup({ isHost: true });
    const controls = screen.getByRole("group", { name: "ルームの操作" });
    expect(
      within(controls).getByRole("button", { name: "参加者 2人" }),
    ).toBeVisible();
    expect(screen.getByTestId("timer-floating")).toBeVisible();
    expect(controls).not.toContainElement(screen.getByTestId("timer-floating"));
    expect(
      within(controls).getByRole("button", { name: "ルームメニューを開く" }),
    ).toBeVisible();
    expect(
      within(controls).getByRole("button", { name: "次のステップへ" }),
    ).toBeVisible();
  });

  it("投票ステップで完了をチェックした参加者のアバターに表示する", () => {
    const members = buildMembers(2, ME);
    setup({
      phase: buildPhaseStep(4),
      members,
      completedVoterIds: [members[0]?.userId ?? ""],
      progress: {
        ...allReadyProgress(members),
        readyUserIds: [members[0].userId],
        notReadyUserIds: [members[1].userId],
        allReady: false,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));

    expect(
      within(
        screen.getByTestId(`member-row-${members[0]?.userId}`),
      ).getByTestId("member-voting-complete"),
    ).toBeVisible();
    expect(
      within(
        screen.getByTestId(`member-row-${members[1]?.userId}`),
      ).queryByTestId("member-voting-complete"),
    ).not.toBeInTheDocument();
  });

  it("自分の完了状態を表示し、同じボタンから取り消せる", () => {
    const members = buildMembers(2, ME);
    const props = setup({
      phase: buildPhaseStep(3, 1),
      onToggleReady: vi.fn(),
      progress: allReadyProgress(members),
    });

    const complete = screen.getByRole("button", { name: "準備OK！を取り消す" });
    expect(complete).toHaveTextContent("準備OK！");
    expect(complete).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(complete);
    expect(props.onToggleReady).toHaveBeenCalledWith(false);
  });

  it("完了フラグを立てた参加者のアバターにチェックを表示する", () => {
    const members = buildMembers(2, ME);
    setup({
      phase: buildPhaseStep(1),
      members,
      progress: {
        phaseRevision: 1,
        progressRevision: 2,
        connectedUserIds: members.map(({ userId }) => userId),
        readyUserIds: [members[0]?.userId ?? ""],
        notReadyUserIds: [members[1]?.userId ?? ""],
        canAdvance: false,
        allReady: false,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));

    expect(
      within(
        screen.getByTestId(`member-row-${members[0]?.userId}`),
      ).getByTestId("member-voting-complete"),
    ).toBeVisible();
    expect(
      within(
        screen.getByTestId(`member-row-${members[1]?.userId}`),
      ).queryByTestId("member-voting-complete"),
    ).not.toBeInTheDocument();
  });

  describe("全員の投票完了表示", () => {
    it.each([buildPhaseStep(4, 1), buildPhaseStep(3, 2), buildPhaseStep(4, 3)])(
      "投票ステップ $phase-$step で全員完了を表示する",
      (phase) => {
        const members = buildMembers(4, ME);
        setup({
          phase,
          members,
          completedVoterIds: members.map(({ userId }) => userId),
          progress: allReadyProgress(members),
        });

        const indicator = screen.getByTestId("vote-completion-indicator");
        expect(indicator).toHaveTextContent("全員OK");
        expect(
          screen.getByText("全員の投票が完了しました"),
        ).toBeInTheDocument();
        expect(indicator.nextElementSibling).toBe(
          screen.getByRole("button", { name: "参加者 4人" }),
        );
      },
    );

    it("省略表示される参加者が未完了なら表示しない", () => {
      const members = buildMembers(5, ME);
      setup({
        phase: buildPhaseStep(4),
        members,
        completedVoterIds: members.slice(0, -1).map(({ userId }) => userId),
      });

      expect(
        screen.queryByTestId("vote-completion-indicator"),
      ).not.toBeInTheDocument();
    });

    it.each([
      ["投票以外", { phase: buildPhaseStep(3) }],
      ["参加者なし", { members: [], completedVoterIds: [] }],
      ["切断中", { isDisconnected: true }],
    ])("%sでは全員完了と表示しない", (_label, overrides) => {
      const members = buildMembers(2, ME);
      setup({
        phase: buildPhaseStep(4),
        members,
        completedVoterIds: members.map(({ userId }) => userId),
        progress: allReadyProgress(members),
        ...overrides,
      });

      expect(
        screen.queryByTestId("vote-completion-indicator"),
      ).not.toBeInTheDocument();
    });

    it("120msの完了表示アニメーションを抑制できる", () => {
      const members = buildMembers(2, ME);
      setup({
        phase: buildPhaseStep(4),
        isHost: true,
        members,
        completedVoterIds: members.map(({ userId }) => userId),
        progress: allReadyProgress(members),
      });

      expect(screen.getByTestId("vote-completion-label")).toHaveClass(
        "transition-[max-width,opacity]",
        "duration-[120ms]",
        "starting:max-w-0",
        "starting:opacity-0",
        "motion-reduce:transition-none",
        "text-emerald-700",
      );
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toHaveClass("max-[900px]:px-2", "max-[900px]:text-xs");
    });
  });

  it("参加者にも idle タイマーをフローティング表示する", () => {
    setup({ isHost: false, timer: { status: "idle" } });

    const controls = screen.getByRole("group", { name: "ルームの操作" });
    expect(screen.getByTestId("timer-floating")).toBeVisible();
    expect(controls).not.toContainElement(screen.getByTestId("timer-floating"));
  });

  it("投票ステップでも投票パレットを上部HUDには表示しない", () => {
    setup({ phase: buildPhaseStep(4) });

    expect(
      screen.queryByRole("region", { name: "投票パレット" }),
    ).not.toBeInTheDocument();
  });

  describe("ステップ移行", () => {
    it("参加者にも「次のステップへ」を表示する", () => {
      setup({ isHost: false });
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
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

    it.each([true, false])(
      "最終案の決定前も完了ボタンを表示し、決定後に有効にする（host=%s）",
      (isHost) => {
        const onPublishOutcome = vi.fn();
        const props = setupProps({
          isHost,
          phase: buildPhaseStep(5, 3),
          hasFinalDecision: false,
          timer: { status: "ended", durationMs: 300_000 },
          onPublishOutcome,
        });
        const { rerender } = render(<RoomBoardHeader {...props} />);
        const completion = screen.getByRole("button", {
          name: "完了して成果を表示",
        });
        expect(completion).toBeDisabled();
        fireEvent.click(completion);
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(onPublishOutcome).not.toHaveBeenCalled();
        rerender(<RoomBoardHeader {...props} hasFinalDecision />);
        expect(completion).toBeEnabled();
        fireEvent.click(completion);
        expect(screen.getByRole("alertdialog")).toBeVisible();
        expect(onPublishOutcome).not.toHaveBeenCalled();
      },
    );

    it.each([true, false])(
      "最終完了はホスト・参加者とも確認と取消ができる（host=%s）",
      (isHost) => {
        const onPublishOutcome = vi.fn();
        setup({
          isHost,
          phase: buildPhaseStep(5, 3),
          hasFinalDecision: true,
          timer: { status: "ended", durationMs: 300_000 },
          onPublishOutcome,
        });
        fireEvent.click(
          screen.getByRole("button", { name: "完了して成果を表示" }),
        );
        expect(onPublishOutcome).not.toHaveBeenCalled();
        expect(screen.getByRole("alertdialog")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
        expect(onPublishOutcome).not.toHaveBeenCalled();
        fireEvent.click(
          screen.getByRole("button", { name: "完了して成果を表示" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "完了する" }));
        expect(onPublishOutcome).toHaveBeenCalledOnce();
      },
    );

    it.each([buildPhaseStep(5), buildPhaseStep(4, 2)])(
      "%jで採用前は進行ボタンを表示したまま無効にする",
      (phase) => {
        const onNextPhase = vi.fn();
        setup({ isHost: true, phase, isNextPhaseBlocked: true, onNextPhase });
        const next = screen.getByRole("button", { name: "次のステップへ" });
        expect(next).toBeDisabled();
        fireEvent.click(next);
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(onNextPhase).not.toHaveBeenCalled();
      },
    );

    it("途中の結果ステップではホストに「次のステップへ」を表示する", () => {
      setup({ isHost: true, phase: buildPhaseStep(5) });

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
    });

    it("確認ダイアログの確定で onNextPhase を呼ぶ", () => {
      const onNextPhase = vi.fn();
      const members = buildMembers(2, ME);
      setup({
        isHost: true,
        members,
        timer: { status: "ended", durationMs: 300_000 },
        progress: {
          phaseRevision: 1,
          progressRevision: 2,
          connectedUserIds: members.map(({ userId }) => userId),
          readyUserIds: [ME],
          notReadyUserIds: [members[1]?.userId ?? ""],
          canAdvance: true,
          allReady: false,
        },
        onNextPhase,
      });

      fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
      fireEvent.click(screen.getByRole("button", { name: "次へ進む" }));

      expect(onNextPhase).toHaveBeenCalledTimes(1);
    });
  });

  describe("接続状態の表示（loading / error / success）", () => {
    it("接続確立中は接続中の表示を出す", () => {
      setup({ connectionStatus: "connecting" });
      expect(screen.getByRole("status")).toHaveTextContent("接続しています");
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

  it.each([buildPhaseStep(5), buildPhaseStep(4, 2), buildPhaseStep(5, 3)])(
    "%jで結果モーダルの再表示ボタンを出さない",
    (phase) => {
      setup({ phase });
      expect(
        screen.queryByRole("button", { name: "投票結果を表示" }),
      ).not.toBeInTheDocument();
    },
  );

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

    expect(
      screen
        .getAllByRole("list")
        .find((list) => list.classList.contains("p-1")),
    ).toHaveClass("p-1");
  });
});

describe("共有の進行欄", () => {
  const sharing = {
    revision: "33333333-3333-4333-8333-333333333333",
    order: buildMembers(3, ME),
    status: "active" as const,
    currentIndex: 0,
    results: [],
    durationMs: 180000,
    startsAt: null,
  };
  it("現在の進行状況と全体の順番を表示する", () => {
    render(
      <RoomBoardHeader
        {...setupProps({
          isHost: true,
          phase: buildPhaseStep(2),
          timer: { status: "ended", durationMs: 180_000 },
        })}
        {...{ sharing, onSharingStart: vi.fn(), onSharingAdvance: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: "できた！" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "発表者と全体の順番を確認" }),
    );
    expect(screen.getAllByText("これから")).toHaveLength(2);
  });
  it("交代中は顔と名前を表示し、計時と進行操作を待つ", () => {
    render(
      <RoomBoardHeader
        {...setupProps({
          isHost: true,
          phase: buildPhaseStep(2),
        })}
        {...{
          sharing: { ...sharing, startsAt: Date.now() + 2000 },
          onSharingStart: vi.fn(),
          onSharingAdvance: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByText(`${sharing.order[0].name}さんのターンです`),
    ).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("03:00");
    expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "今回はパス" })).toBeDisabled();
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
  });
});

it("別画面で共有が開始されたらその持ち時間で交代を表示する", () => {
  const ready = buildSharingState();
  const props = {
    ...setupProps({
      isHost: true,
      phase: buildPhaseStep(2),
    }),
    sharing: ready,
    onSharingStart: vi.fn(),
  };
  const { rerender } = render(<RoomBoardHeader {...props} />);
  expect(screen.getByRole("timer")).toHaveTextContent("03:00");
  rerender(
    <RoomBoardHeader
      {...props}
      sharing={{
        ...ready,
        status: "active",
        currentIndex: 0,
        durationMs: 30000,
        startsAt: Date.now() + 2000,
      }}
    />,
  );
  expect(screen.getByRole("timer")).toHaveTextContent("00:30");
});

it("一巡後はHUDに次の操作を表示する", () => {
  const sharing = buildSharingState({
    status: "complete",
    results: ["done", "passed", "done"],
  });
  render(
    <RoomBoardHeader
      {...setupProps({
        currentUserId: sharing.order.at(-1)?.userId ?? ME,
        phase: buildPhaseStep(2),
        timer: { status: "ended", durationMs: 180_000 },
      })}
      sharing={sharing}
    />,
  );
  expect(screen.getByText("共有完了")).toBeVisible();
  expect(screen.getByRole("button", { name: "できた！" })).toBeEnabled();
  expect(screen.getByRole("timer")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "次の人へ" }),
  ).not.toBeInTheDocument();
});
it("共有完了後は参加者全員が完了から次工程へ進める", () => {
  const sharing = buildSharingState({
    status: "complete",
    results: ["done", "passed", "done"],
  });
  setup({
    sharing,
    phase: buildPhaseStep(2),
    timer: { status: "ended", durationMs: 180_000 },
  });

  expect(screen.queryByTestId("sharing-advance")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "できた！" })).toBeEnabled();
});
it("発表者以外は完了を押せず、時間切れ後のパスだけ行える", () => {
  render(
    <RoomBoardHeader
      {...setupProps({
        phase: buildPhaseStep(2),
        timer: { status: "ended", durationMs: 180_000 },
      })}
      sharing={buildSharingState({ status: "active", currentIndex: 1 })}
    />,
  );
  expect(
    screen.getByRole("button", { name: "発表者と全体の順番を確認" }),
  ).toBeEnabled();
  expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "今回はパス" })).toBeEnabled();
});

it.each([{ phaseRevision: 2 }, { isDisconnected: true }])(
  "共有中のメニューで開いた確認も状態変更 %j で破棄する",
  (changed) => {
    const props = setupProps({
      isHost: true,
      phase: buildPhaseStep(2),
      phaseRevision: 1,
      sharing: buildSharingState(),
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    openRoomMenu();
    expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
    rerender(<RoomBoardHeader {...props} {...changed} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(props.onNextPhase).not.toHaveBeenCalled();
  },
);

describe("U03 進行の役割", () => {
  it.each([true, false])(
    "HUDにホストの案内を表示しない: isHost=%s",
    (isHost) => {
      setup({ isHost });
      const context = screen.getByTestId("board-context-hud");
      expect(context).not.toHaveTextContent("ホスト：進行はあなたが操作");
      expect(context).not.toHaveTextContent("参加者：次への進行はホストが操作");
      expect(
        within(context).queryByRole("button", { name: "ゴールと進行" }),
      ).not.toBeInTheDocument();
    },
  );
});

it("発表者の完了で交代し、交代中・切断中・他人の番では完了できない", () => {
  const props = setupProps({
    phase: buildPhaseStep(2),
    timer: { status: "ended", durationMs: 180_000 },
    sharing: buildSharingState({ status: "active", currentIndex: 0 }),
    onSharingAdvance: vi.fn(),
  });
  const { rerender } = render(<RoomBoardHeader {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "できた！" }));
  expect(props.onSharingAdvance).toHaveBeenCalledExactlyOnceWith("done");
  expect(screen.getByRole("button", { name: "今回はパス" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "次のステップへ" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "最初の人を開始" }),
  ).not.toBeInTheDocument();
  rerender(
    <RoomBoardHeader
      {...props}
      sharing={buildSharingState({
        status: "active",
        currentIndex: 0,
        startsAt: Date.now() + 2000,
      })}
    />,
  );
  expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
  rerender(<RoomBoardHeader {...props} isDisconnected />);
  expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
  rerender(
    <RoomBoardHeader
      {...props}
      sharing={buildSharingState({ status: "active", currentIndex: 1 })}
    />,
  );
  expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
});

it("最後の発表中は発表完了操作だけを表示する", () => {
  const onNextPhase = vi.fn();
  setup({
    isHost: true,
    phase: buildPhaseStep(2),
    sharing: buildSharingState({ status: "active", currentIndex: 2 }),
    onNextPhase,
  });

  expect(screen.queryByTestId("sharing-advance")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "できた！" })).toBeInTheDocument();

  openRoomMenu();
  expect(
    within(screen.getByRole("dialog", { name: "ルームメニュー" })).queryByRole(
      "button",
      { name: "次のステップへ" },
    ),
  ).not.toBeInTheDocument();
  expect(onNextPhase).not.toHaveBeenCalled();
});

it("招待PopoverからURLのみを共有する", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  try {
    setup({ isHost: true, hmwDecidedIssue: "非公開内容をpayloadへ入れない" });
    openRoomMenu();
    fireEvent.click(screen.getByRole("button", { name: "招待" }));
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "招待URLを共有" }),
    );
    expect(share).toHaveBeenCalledExactlyOnceWith({
      url: "https://idea-flow.example/invite/AB12CD",
    });
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});

describe("作業中のホスト変更", () => {
  it.each([1, 2, 3, 4, 5])("ステップ%sでも参加者一覧から相手を選ぶ", (step) => {
    const onSelectHostTarget = vi.fn();
    const props = setup({
      isHost: true,
      phase: buildPhaseStep(step),
      onSelectHostTarget,
    });
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
    fireEvent.click(screen.getByRole("button", { name: "Taro Yamada" }));
    expect(onSelectHostTarget).toHaveBeenCalledExactlyOnceWith(
      props.members[1].userId,
    );
    expect(
      screen.queryByRole("button", { name: "ホスト交代" }),
    ).not.toBeInTheDocument();
  });
  it.each([{ isHost: false }, { outcomePublished: true }])(
    "非ホスト・完了後は相手をホストにできない %o",
    (state) => {
      setup({ isHost: true, onSelectHostTarget: vi.fn(), ...state });
      fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
      expect(
        screen.queryByRole("button", { name: "Taro Yamada" }),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    { isDisconnected: true },
    { isNextPhasePending: true },
    { isTransferring: true },
    { isLeaving: true },
  ])("別処理中・切断中には選択を止める %o", (state) => {
    setup({ isHost: true, onSelectHostTarget: vi.fn(), ...state });
    fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
    expect(screen.getByRole("button", { name: "Taro Yamada" })).toBeDisabled();
  });
});

it("成果公開後は本人の編集案内と鉛筆を消し、編集を実行しない", () => {
  const onEditSelf = vi.fn();
  const props = setupProps({ onEditSelf });
  const { rerender } = render(<RoomBoardHeader {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "参加者 2人" }));
  const row = screen.getByTestId(`member-row-${ME}`);
  expect(
    within(row).getByRole("button", { name: /表示名を変更/ }),
  ).toBeInTheDocument();
  expect(row.querySelector("svg.lucide-pencil")).not.toBeNull();

  rerender(<RoomBoardHeader {...props} outcomePublished />);
  expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  expect(row.querySelector("svg.lucide-pencil")).toBeNull();
  fireEvent.click(row);
  expect(onEditSelf).not.toHaveBeenCalled();
});

it("右上のルームメニューからフィードバックを開き、常設入口へ復帰先を渡す", () => {
  const onOpenFeedback = vi.fn();
  setup({ onOpenFeedback });
  expect(
    screen.queryByRole("button", { name: "フィードバック" }),
  ).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "ルームメニューを開く" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  expect(onOpenFeedback).toHaveBeenCalledWith(trigger);
  expect(
    screen.queryByRole("dialog", { name: "ルームメニュー" }),
  ).not.toBeInTheDocument();
});

it("復元可能な戻り先がある参加者に戻る操作を提供する", () => {
  const props = setupProps({ isHost: true });
  const { rerender } = render(
    <RoomBoardHeader
      {...props}
      rollbackTarget={buildPhaseStep(1, 1)}
      onRollbackPhase={vi.fn()}
    />,
  );
  openRoomMenu();
  expect(
    screen.getByRole("button", { name: "直前のステップに戻る" }),
  ).toBeVisible();
  rerender(
    <RoomBoardHeader
      {...props}
      isHost={false}
      rollbackTarget={buildPhaseStep(1, 1)}
      onRollbackPhase={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "直前のステップに戻る" }),
  ).toBeVisible();
});

it("参加者はルームメニューで現在名と変更入口を確認でき、完了後は変更できない", () => {
  const onRenameRoom = vi.fn();
  const props = setupProps({ roomName: "J05", onRenameRoom });
  const { rerender } = render(<RoomBoardHeader {...props} />);
  expect(screen.queryByText("J05")).not.toBeInTheDocument();
  openRoomMenu();
  expect(screen.getByText("J05")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ルーム名を変更" }));
  expect(onRenameRoom).toHaveBeenCalledOnce();
  rerender(<RoomBoardHeader {...props} outcomePublished />);
  openRoomMenu();
  expect(
    screen.queryByRole("button", { name: "ルーム名を変更" }),
  ).not.toBeInTheDocument();
});

describe("全員のチェック", () => {
  it("未完了者がいる間は次へ進めず、本人は完了を送信できる", () => {
    vi.useFakeTimers();
    try {
      const members = buildMembers(3, ME);
      const progress = {
        ...allReadyProgress(members),
        readyUserIds: [members[1].userId],
        notReadyUserIds: [ME, members[2].userId],
        canAdvance: false,
        allReady: false,
      };
      const props = setupProps({ members, progress, onToggleReady: vi.fn() });
      const { rerender } = render(<RoomBoardHeader {...props} />);
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "できた！" }));
      act(() => vi.advanceTimersByTime(440));
      expect(props.onToggleReady).toHaveBeenCalledExactlyOnceWith(true);
      expect(props.onNextPhase).not.toHaveBeenCalled();
      rerender(
        <RoomBoardHeader {...props} progress={allReadyProgress(members)} />,
      );
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

it("投票不足時の次へから手動完了を送らない", () => {
  const members = buildMembers(5, ME);
  const props = setup({
    phase: buildPhaseStep(4),
    members,
    onToggleReady: vi.fn(),
    progress: {
      ...allReadyProgress(members),
      readyUserIds: [],
      notReadyUserIds: members.map((m) => m.userId),
      canAdvance: false,
      allReady: false,
    },
  });
  const next = screen.getByRole("button", {
    name: "次のステップへ",
  });
  expect(next).toBeDisabled();
  fireEvent.click(next);
  expect(props.onToggleReady).not.toHaveBeenCalled();
});

it("完了受信待ちに操作エラーを受けたら、遅れた完了で確認を開かない", () => {
  vi.useFakeTimers();
  try {
    const members = buildMembers(3, ME);
    const progress = {
      ...allReadyProgress(members),
      readyUserIds: [members[1].userId],
      notReadyUserIds: [ME, members[2].userId],
      canAdvance: false,
      allReady: false,
    };
    const props = setupProps({ members, progress, onToggleReady: vi.fn() });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "できた！" }));
    act(() => vi.advanceTimersByTime(440));
    expect(props.onToggleReady).toHaveBeenCalledOnce();
    rerender(<RoomBoardHeader {...props} completionResetVersion={1} />);
    rerender(
      <RoomBoardHeader
        {...props}
        completionResetVersion={1}
        progress={{
          ...progress,
          readyUserIds: [ME, members[1].userId],
          notReadyUserIds: [members[2].userId],
          canAdvance: true,
        }}
      />,
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.onNextPhase).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
