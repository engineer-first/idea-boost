import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildMembers,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import * as facilitationGuide from "../logic/facilitation-guide";
import { stepGuideSeenStorageKey } from "../logic/step-guide-seen";
import { RoomBoardHeader } from "./room-board-header";
import styles from "./room-board-header.module.css";

const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
  for (const step of ["1-2", "1-3", "1-4", "1-5", "2-1", "3-1", "3-3"])
    localStorage.setItem(stepGuideSeenStorageKey(ME, step), "seen");
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

    isDisconnected: false,
    connectionStatus: "open" as const,
    members: buildMembers(2, ME),
    currentUserId: ME,

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
  expect(slideContent).toHaveAttribute("data-slide-transition", "moving");
  expect(within(dialog).getByRole("heading")).toHaveTextContent(currentTitle);
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "idle"),
  );
}

async function returnToOnboardingSlide(index: number, title: string) {
  const slideContent = screen.getByTestId("step-one-onboarding-slide-content");
  fireEvent.click(
    screen.getByRole("button", { name: `${index + 1}枚目に戻る` }),
  );
  expect(slideContent).toHaveAttribute("data-slide-transition", "moving");
  await waitFor(() =>
    expect(slideContent).toHaveAttribute("data-slide-transition", "idle"),
  );
  expect(screen.getByRole("dialog", { name: title })).toBeVisible();
}

describe("RoomBoardHeader", () => {
  it("1-1以外は進め方ガイドを表示せず、規定時間で自動開始する", async () => {
    const props = setup({
      phase: buildPhaseStep(3),
      progress: {
        ...allReadyProgress(buildMembers(2, ME)),
        connectedUserIds: [ME],
        readyUserIds: [],
        allReady: false,
        canAdvance: false,
      },
    });
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(props.onTimerStart).toHaveBeenCalledWith(240_000),
    );
  });
  it("ホスト不在なら接続中の参加者が案内終了後に規定時間で自動開始する", async () => {
    const props = setupProps({
      phase: buildPhaseStep(3),

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
    const firstUserId = "00000000-0000-4000-8000-000000000000";
    const members = buildMembers(2, ME);
    members[1] = { ...members[1], userId: firstUserId };
    const progress = {
      ...allReadyProgress(members),
      connectedUserIds: [firstUserId, ME],
      readyUserIds: [],
      allReady: false,
      canAdvance: false,
    };
    const props = setupProps({
      phase: buildPhaseStep(3),

      progress,
      members,
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
    const members = buildMembers(2, ME);
    members[1] = {
      ...members[1],
      userId: "00000000-0000-4000-8000-000000000000",
    };
    const props = setupProps({
      members,
      phase: buildPhaseStep(3),
      progress: {
        ...allReadyProgress(members),
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
  describe("共有付箋を出し切った後の完了操作への誘導", () => {
    it.each([1, 2, 3] as const)(
      "%i-2では付箋を出し切った発表者を誘導し、押下で誘導を止める",
      (phase) => {
        const onSharingAdvance = vi.fn();
        const props = setupProps({
          phase: buildPhaseStep(2, phase),
          sharing: buildSharingState({ status: "active", currentIndex: 0 }),
          onSharingAdvance,
        });
        const { rerender } = render(<RoomBoardHeader {...props} />);
        const button = screen.getByRole("button", { name: "できた！" });

        expect(button).not.toHaveAttribute("data-sharing-completion-cue");
        rerender(<RoomBoardHeader {...props} hasNoUnsharedNotes />);

        expect(button).toHaveAttribute("data-sharing-completion-cue");
        expect(button).toBeEnabled();
        fireEvent.click(button);
        expect(onSharingAdvance).toHaveBeenCalledExactlyOnceWith("done");
        expect(button).not.toHaveAttribute("data-sharing-completion-cue");
      },
    );

    it("初めから付箋がないときは発表開始後に誘導し、付箋を戻すか発表者が替わると止める", () => {
      const sharing = buildSharingState({
        status: "active",
        currentIndex: 0,
      });
      const props = setupProps({
        phase: buildPhaseStep(2),
        sharing,
        onSharingAdvance: vi.fn(),
        hasNoUnsharedNotes: true,
      });
      const { rerender } = render(
        <RoomBoardHeader
          {...props}
          sharing={{ ...sharing, startsAt: Date.now() + 1000 }}
        />,
      );
      const button = screen.getByRole("button", { name: "できた！" });
      expect(button).not.toHaveAttribute("data-sharing-completion-cue");
      expect(button).toBeDisabled();

      rerender(<RoomBoardHeader {...props} />);
      expect(button).toHaveAttribute("data-sharing-completion-cue");

      rerender(<RoomBoardHeader {...props} hasNoUnsharedNotes={false} />);
      expect(button).not.toHaveAttribute("data-sharing-completion-cue");
      rerender(<RoomBoardHeader {...props} />);
      expect(button).toHaveAttribute("data-sharing-completion-cue");

      rerender(
        <RoomBoardHeader
          {...props}
          sharing={{ ...sharing, currentIndex: 1 }}
        />,
      );
      expect(button).not.toHaveAttribute("data-sharing-completion-cue");
      expect(button).toBeDisabled();
    });

    it("できた！を押した後は、同じ発表中に一時切断から復帰しても誘導を出し直さない", () => {
      const props = setupProps({
        phase: buildPhaseStep(2),
        sharing: buildSharingState({ status: "active", currentIndex: 0 }),
        onSharingAdvance: vi.fn(),
        hasNoUnsharedNotes: true,
      });
      const { rerender } = render(<RoomBoardHeader {...props} />);
      const button = screen.getByRole("button", { name: "できた！" });
      expect(button).toHaveAttribute("data-sharing-completion-cue");
      fireEvent.click(button);

      rerender(<RoomBoardHeader {...props} isDisconnected />);
      rerender(<RoomBoardHeader {...props} />);

      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("data-sharing-completion-cue");

      rerender(<RoomBoardHeader {...props} hasNoUnsharedNotes={false} />);
      rerender(<RoomBoardHeader {...props} />);
      expect(button).toHaveAttribute("data-sharing-completion-cue");
    });

    it.each([
      ["個人作業中", { phase: buildPhaseStep(1) }],
      ["切断中", { isDisconnected: true }],
      ["完了操作を受け付けない状態", { onSharingAdvance: undefined }],
    ] as const)("%sでは付箋がなくても誘導しない", (_, overrides) => {
      setup({
        phase: buildPhaseStep(2),
        sharing: buildSharingState({ status: "active", currentIndex: 0 }),
        onSharingAdvance: vi.fn(),
        onToggleReady: vi.fn(),
        hasNoUnsharedNotes: true,
        ...overrides,
      });
      expect(
        screen.getByRole("button", { name: "できた！" }),
      ).not.toHaveAttribute("data-sharing-completion-cue");
    });
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
  it("投票工程で票が残っている間の「できた！」は、押せる条件を伝える", () => {
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
      completedVoterIds: [],
      onToggleReady: vi.fn(),
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    const done = screen.getByRole("button", { name: "できた！" });
    expect(done).toBeDisabled();
    expect(done).toHaveAttribute("title", "票をすべて使うと押せます");
    // ホバーしなくても、押せない理由が次へのボタンの文言で見える。
    expect(
      screen.getByRole("button", { name: "全票使うと次へ" }),
    ).toBeDisabled();

    rerender(<RoomBoardHeader {...props} completedVoterIds={[ME]} />);
    expect(screen.getByRole("button", { name: "できた！" })).toHaveAttribute(
      "title",
      "次へ進む準備ができたことをみんなに伝えます",
    );
    expect(
      screen.queryByRole("button", { name: "全票使うと次へ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "あと2人で次へ" }),
    ).toBeInTheDocument();
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
    // 採用済みでも全員がそろうまでは、何を待っているかをボタンに出す。
    expect(
      screen.queryByRole("button", { name: "完了して成果を表示" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "あと1人で完了" }),
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
    const button = screen.getByRole("button", { name: "再接続中…" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveClass(styles.nextReady);
  });
  it("採用前に切断しても、1-5・2-4 と同じく再接続を待っていると示す", () => {
    setup({
      phase: buildPhaseStep(5, 3),
      hasFinalDecision: false,
      isDisconnected: true,
    });
    expect(screen.getByRole("button", { name: "再接続中…" })).toBeDisabled();
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
    expect(
      within(screen.getByTestId("board-control-hud")).getByRole("button", {
        name: "あと1人で次へ",
      }),
    ).toHaveAttribute("aria-disabled", "true");
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
  it.each([1, 3, 4].map((step) => ({ step })))(
    "step=$step / isHost=$isHost : 最初から全員完了ならワンクリックで進み、確認ダイアログを開かない",
    ({ step }) => {
      const members = buildMembers(3, ME);
      const props = setup({
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

  it("isHost=%sで確認中に全員が完了してもダイアログを維持し、最新の完了状態で進む", () => {
    const members = buildMembers(3, ME);
    const props = setupProps({
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
    expect(screen.getByRole("alertdialog")).toHaveTextContent(members[2].name);

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
  });

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
    localStorage.removeItem(stepGuideSeenStorageKey(ME, "1-1"));
    const props = setupProps({
      progress: {
        ...allReadyProgress(buildMembers(2, ME)),
        connectedUserIds: [ME],
        readyUserIds: [],
        allReady: false,
        canAdvance: false,
      },
      inviteCode,
    });
    const { rerender } = render(
      <RoomBoardHeader {...props} phase={buildPhaseStep(1, 1)} />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("listitem", { name: "1枚目 / 全3枚" }),
    ).toBeVisible();
    expect(screen.queryByText("工程 1-1")).not.toBeInTheDocument();

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
    expect(
      screen.getByRole("img", {
        name: "付箋を書く欄に本文を入力し、付箋を追加する操作",
      }),
    ).toBeVisible();

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
    expect(props.onTimerStart).toHaveBeenCalledWith(180000);
    rerender(<RoomBoardHeader {...props} phase={buildPhaseStep(1, 1)} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("一度開いたステップガイドは、別のルームで同じステップに入っても自動表示しない", async () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    const firstRoom = render(
      <RoomBoardHeader
        {...setupProps({
          inviteCode: "FIRST-ROOM",
          currentUserId: userId,
          phase: buildPhaseStep(3),
        })}
      />,
    );
    expect(
      await screen.findByRole("dialog", {
        name: "似ている困りごとを集めよう。",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    firstRoom.unmount();

    setup({
      inviteCode: "SECOND-ROOM",
      currentUserId: userId,
      phase: buildPhaseStep(3),
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("1-1の「進め方」から初回表示後の説明スライドを再度開ける", async () => {
    const inviteCode = "MANUAL1";
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
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

  it("タイマーが時間切れの間だけ、中央のステップバーに次への矢印を出す", () => {
    const props = setupProps({
      phase: buildPhaseStep(1, 1),
      timer: { status: "ended", durationMs: 180_000 },
    });
    const { rerender } = render(<RoomBoardHeader {...props} />);
    const trail = screen.getByTestId("phase-step-trail");
    expect(
      within(trail).getByRole("img", {
        name: "次の「共有」へ進めます",
      }),
    ).toBeVisible();

    rerender(
      <RoomBoardHeader
        {...props}
        timer={{
          status: "running",
          endsAt: Date.now() + 60_000,
          durationMs: 60_000,
        }}
      />,
    );
    expect(
      within(trail).queryByRole("img", { name: /へ進めます$/ }),
    ).not.toBeInTheDocument();
  });

  it("共有の途中で発表者の時間が切れても、次のステップへの矢印は出さない", () => {
    setup({
      phase: buildPhaseStep(2, 1),
      sharing: buildSharingState({ status: "active", currentIndex: 0 }),
      timer: { status: "ended", durationMs: 180_000 },
    });

    expect(
      within(screen.getByTestId("phase-step-trail")).queryByRole("img", {
        name: /へ進めます$/,
      }),
    ).not.toBeInTheDocument();
  });

  it("中央のステップバーの今のステップから進め方を開き、閉じるとそのステップへフォーカスを戻す", async () => {
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
    setup({ inviteCode: "TRAIL-GUIDE", phase: buildPhaseStep(1, 1) });

    const stepButton = within(screen.getByTestId("phase-step-trail")).getByRole(
      "button",
      { name: "「個人」の進め方を開く" },
    );
    fireEvent.click(stepButton);
    expect(
      await screen.findByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stepButton).toHaveFocus();
  });

  it("スライドの進捗から前のスライドへ戻れる", async () => {
    const inviteCode = "ONBOARD-BACK";
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
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
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
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
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "次へ" }));
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(
        screen.getByTestId("step-one-onboarding-slide-content"),
      ).toHaveAttribute("data-slide-transition", "idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("はじめるのモーションが終わった時点でスライドを閉じる", async () => {
    const inviteCode = "ONBOARD-CLOSE";
    localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
    setup({ inviteCode, phase: buildPhaseStep(1, 1) });

    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    await screen.findByRole("dialog", {
      name: "最近あった困ったことを付箋に書き出そう。",
    });
    await advanceOnboardingSlide();

    const dialog = screen.getByRole("dialog");
    await advanceOnboardingSlide();
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
  ] as const)("%sの初回は対象工程だけ案内を表示する", (label, step, phase) => {
    localStorage.removeItem(stepGuideSeenStorageKey(ME, label));
    setup({
      phase: buildPhaseStep(step, phase),
    });

    if (label === "3-2") {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("button", { name: "進め方" })).toBeVisible();
    } else {
      expect(screen.getByRole("dialog")).toBeVisible();
    }
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
    it("host はルームメニューの招待からリンクとコードを開く", () => {
      setup({});

      expect(screen.queryByText("招待コード")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();

      openRoomMenu();
      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      expect(
        screen.getByRole("button", { name: "招待リンクをコピー" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveTextContent("AB12CD");
    });

    it("作業画面ではメニューを開かなくてもテーマを確認できる", () => {
      setup({ roomName: "J05" });
      expect(screen.getByTestId("board-room-theme")).toHaveTextContent(
        "テーマ：J05",
      );
      expect(
        screen.queryByRole("dialog", { name: "ルームメニュー" }),
      ).not.toBeInTheDocument();
    });

    it("作業画面ではルームの状態が届くまで「テーマ未設定」と出さない", () => {
      setup({ roomName: null, roomNameLoaded: false });
      expect(screen.getByTestId("board-room-theme")).not.toHaveTextContent(
        "テーマ未設定",
      );
    });

    it("ルームメニューの招待の「リンクをコピー」1つで、テーマ・参加リンク・招待コードを含む招待文をコピーできる", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      try {
        setup({ roomName: "J05" });
        openRoomMenu();
        fireEvent.click(screen.getByRole("button", { name: "招待" }));
        const invite = screen.getByTestId("board-view-invite");
        expect(
          within(invite).queryByRole("button", { name: "招待文をコピー" }),
        ).not.toBeInTheDocument();
        await act(async () =>
          fireEvent.click(
            within(invite).getByRole("button", { name: "招待リンクをコピー" }),
          ),
        );
        expect(writeText).toHaveBeenCalledExactlyOnceWith(
          [
            "Idea Boost のルームに招待します。",
            "テーマ: J05",
            "参加リンク: https://idea-flow.example/invite/AB12CD",
            "招待コード: AB12CD",
          ].join("\n"),
        );
      } finally {
        if (original) Object.defineProperty(navigator, "clipboard", original);
        else Reflect.deleteProperty(navigator, "clipboard");
      }
    });

    it("招待ラベルの下に値を配置する", () => {
      setup({});
      openRoomMenu();
      fireEvent.click(screen.getByRole("button", { name: "招待" }));

      const invite = screen.getByTestId("board-view-invite");
      // URLの全文は出さず、「リンクをコピー」のボタンだけを置く。
      expect(within(invite).queryByText("招待URL")).not.toBeInTheDocument();
      expect(
        within(invite).getByRole("button", { name: "招待リンクをコピー" }),
      ).toHaveTextContent("リンクをコピー");
      expect(within(invite).getByText("招待コード")).toHaveClass("block");
      expect(
        within(invite).getByRole("button", { name: "招待コードをコピー" }),
      ).toHaveClass("w-full", "text-left");
    });

    it("参加者にも招待情報を表示する", () => {
      setup({});

      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();
      openRoomMenu();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("招待コード")).not.toBeInTheDocument();
    });

    it.each([
      ["発表者", 0],
      ["発表待ちの参加者", 1],
    ])(
      "共有中も%sはルームメニューから招待URLとコードをコピーできる",
      (_, currentIndex) => {
        setup({
          phase: buildPhaseStep(2),
          sharing: buildSharingState({ status: "active", currentIndex }),
          onSharingAdvance: vi.fn(),
        });
        openRoomMenu();
        fireEvent.click(screen.getByRole("button", { name: "招待" }));

        const invite = screen.getByTestId("board-view-invite");
        expect(
          within(invite).getByRole("button", { name: "招待リンクをコピー" }),
        ).toBeInTheDocument();
        expect(
          within(invite).getByRole("button", { name: "招待コードをコピー" }),
        ).toHaveTextContent("AB12CD");
      },
    );

    it("成果を公開した後は参加できないため招待を出さない", () => {
      setup({ outcomePublished: true });
      openRoomMenu();
      expect(
        screen.queryByRole("button", { name: "招待" }),
      ).not.toBeInTheDocument();
    });

    it("共有の準備中もルームメニューから招待できる", () => {
      setup({
        phase: buildPhaseStep(2),
        sharing: buildSharingState({ status: "ready" }),
        onSharingAdvance: vi.fn(),
      });
      openRoomMenu();
      expect(screen.getByRole("button", { name: "招待" })).toBeVisible();
    });
  });

  it("ルームメニューは招待と退出操作を表示する", () => {
    setup({});
    openRoomMenu();
    expect(screen.getByRole("button", { name: "招待" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "退出する" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
  });

  it("ボードがpointerdownの伝播を止めても外側クリックで閉じ、元のクリックを通す", () => {
    const onOutsideClick = vi.fn();
    render(
      <div onPointerDownCapture={(event) => event.stopPropagation()}>
        <RoomBoardHeader {...setupProps({})} />
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
      [buildPhaseStep(1), "03"],
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
        localStorage.setItem(
          stepGuideSeenStorageKey(ME, `${phase.phase}-${phase.step}`),
          "seen",
        );
        localStorage.setItem(stepGuideSeenStorageKey(ME, "1-1"), "seen");
        setup({
          inviteCode,

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
    setup({});
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

  it("押し済みの「できた！」は同じ呼び方のまま押し済みを示し、押し直すと取り消せる", () => {
    const members = buildMembers(2, ME);
    const props = setup({
      phase: buildPhaseStep(3, 1),
      onToggleReady: vi.fn(),
      progress: allReadyProgress(members),
    });

    const complete = screen.getByRole("button", { name: "できた！を取り消す" });
    expect(complete).toHaveTextContent("できた！");
    expect(complete).toHaveAttribute("aria-pressed", "true");
    expect(complete).toHaveAttribute(
      "title",
      expect.stringContaining("取り消"),
    );
    fireEvent.click(complete);
    expect(props.onToggleReady).toHaveBeenCalledWith(false);
  });

  it.each([
    ["接続中", false, undefined],
    ["切断中", true, "true"],
  ] as const)(
    "%sの押し済みの「できた！」は、押せない間だけ押せない表示の印を持つ",
    (_label, isDisconnected, expected) => {
      const members = buildMembers(2, ME);
      setup({
        phase: buildPhaseStep(3, 1),
        onToggleReady: vi.fn(),
        progress: allReadyProgress(members),
        isDisconnected,
      });

      const complete = screen.getByRole("button", {
        name: "できた！を取り消す",
      });
      expect(complete.dataset.unavailable).toBe(expected);
    },
  );

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
        "text-state-decided-text",
      );
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toHaveClass("max-[900px]:px-2", "max-[900px]:text-sm");
    });
  });

  it("参加者にも idle タイマーをフローティング表示する", () => {
    setup({ timer: { status: "idle" } });

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
      setup({});
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
    });

    it.each([
      ["ステップ移行 pending", { isNextPhasePending: true }],
      // 決定待ち・次ステップ未実装などのブロック判定は view 側の責務。
      ["ブロック中", { isNextPhaseBlocked: true }],
    ])("%s では「次のステップへ」が無効になる", (_label, overrides) => {
      setup({ ...overrides });
      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeDisabled();
    });

    it("タイマー中に未完了メンバーがいる間は、あと何人で進めるかを出す", () => {
      const members = buildMembers(3, ME);
      setup({
        members,
        timer: {
          status: "running",
          durationMs: 300_000,
          endsAt: Date.now() + 300_000,
        },
        progress: {
          ...allReadyProgress(members),
          readyUserIds: [members[0].userId],
          notReadyUserIds: [members[1].userId, members[2].userId],
          canAdvance: false,
          allReady: false,
        },
      });

      expect(
        screen.getByRole("button", { name: "あと2人で次へ" }),
      ).toBeDisabled();
    });

    it("未接続の間は、再接続中と出す", () => {
      setup({ isDisconnected: true });

      expect(screen.getByRole("button", { name: "再接続中…" })).toBeDisabled();
    });

    it.each([
      ["課題決定", buildPhaseStep(5, 1)],
      ["問い決定", buildPhaseStep(4, 2)],
    ])("%sで採用前は、人数より先に採用が要ることを出す", (_label, phase) => {
      const members = buildMembers(3, ME);
      setup({
        phase,
        members,
        isNextPhaseBlocked: true,
        progress: {
          ...allReadyProgress(members),
          readyUserIds: [members[0].userId],
          notReadyUserIds: [members[1].userId, members[2].userId],
          canAdvance: false,
          allReady: false,
        },
      });

      expect(
        screen.getByRole("button", { name: "採用すると次へ" }),
      ).toBeDisabled();
    });

    it("最終ステップではホストにも「次のステップへ」を表示しない", () => {
      setup({ phase: buildPhaseStep(5, 3) });

      expect(
        screen.queryByRole("button", { name: "次のステップへ" }),
      ).not.toBeInTheDocument();
    });

    it("最終案の決定前は完了ボタンに採用が要ることを出し、決定後に有効にする", () => {
      const onPublishOutcome = vi.fn();
      const props = setupProps({
        phase: buildPhaseStep(5, 3),
        hasFinalDecision: false,
        timer: { status: "ended", durationMs: 300_000 },
        onPublishOutcome,
      });
      const { rerender } = render(<RoomBoardHeader {...props} />);
      const completion = screen.getByRole("button", {
        name: "採用すると完了",
      });
      expect(completion).toBeDisabled();
      fireEvent.click(completion);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(onPublishOutcome).not.toHaveBeenCalled();
      rerender(<RoomBoardHeader {...props} hasFinalDecision />);
      expect(completion).toBeEnabled();
      expect(completion).toHaveAccessibleName("完了して成果を表示");
      fireEvent.click(completion);
      expect(screen.getByRole("alertdialog")).toBeVisible();
      expect(onPublishOutcome).not.toHaveBeenCalled();
    });

    it("最終完了はホスト・参加者とも確認と取消ができる（host=%s）", () => {
      const onPublishOutcome = vi.fn();
      setup({
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
    });

    it.each([buildPhaseStep(5), buildPhaseStep(4, 2)])(
      "%jで採用前は進行ボタンを表示したまま無効にする",
      (phase) => {
        const onNextPhase = vi.fn();
        setup({ phase, isNextPhaseBlocked: true, onNextPhase });
        const next = screen.getByRole("button", { name: "採用すると次へ" });
        expect(next).toBeDisabled();
        fireEvent.click(next);
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(onNextPhase).not.toHaveBeenCalled();
      },
    );

    it("途中の結果ステップではホストに「次のステップへ」を表示する", () => {
      setup({ phase: buildPhaseStep(5) });

      expect(
        screen.getByRole("button", { name: "次のステップへ" }),
      ).toBeInTheDocument();
    });

    it("確認ダイアログの確定で onNextPhase を呼ぶ", () => {
      const onNextPhase = vi.fn();
      const members = buildMembers(2, ME);
      setup({
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
    it("host は「退出する」、非 host は「退出する」の文言になる", () => {
      setup({});
      openRoomMenu();
      expect(
        screen.getByRole("button", { name: "退出する" }),
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
          members: sharing.order,
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
          phase: buildPhaseStep(2),
        })}
        {...{
          sharing: { ...sharing, currentIndex: 1, startsAt: Date.now() + 2000 },
          onSharingStart: vi.fn(),
          onSharingAdvance: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByText(`${sharing.order[1].name}さんのターンです`),
    ).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("03:00");
    expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "今回はパス" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-guide")).not.toBeInTheDocument();
  });
  it("交代が終わって発表中になっても、ボード上部に発表者の名前を出し続ける", () => {
    const active = { ...sharing, status: "active" as const, currentIndex: 1 };
    render(
      <RoomBoardHeader
        {...setupProps({ phase: buildPhaseStep(2) })}
        {...{
          sharing: active,
          onSharingStart: vi.fn(),
          onSharingAdvance: vi.fn(),
        }}
      />,
    );
    expect(screen.getByTestId("sharing-current-presenter")).toHaveTextContent(
      `${active.order[1].name}さんのターンです`,
    );
  });
  it("自分の番なら発表者の表示を「あなたのターンです」にする", () => {
    const active = { ...sharing, status: "active" as const, currentIndex: 0 };
    render(
      <RoomBoardHeader
        {...setupProps({
          phase: buildPhaseStep(2),
          currentUserId: active.order[0].userId,
        })}
        {...{
          sharing: active,
          onSharingStart: vi.fn(),
          onSharingAdvance: vi.fn(),
        }}
      />,
    );
    const banner = screen.getByTestId("sharing-current-presenter");
    expect(banner).toHaveTextContent("あなたのターンです");
    expect(banner).toHaveAttribute("data-self", "true");
  });
  it.each([
    [
      "発表者",
      0,
      "マイ付箋をボードに出して説明しよう",
      "話を聞いて、リアクションを送ろう",
    ],
    [
      "聞く人",
      1,
      "話を聞いて、リアクションを送ろう",
      "マイ付箋をボードに出して説明しよう",
    ],
  ])(
    "発表中は%sに今することを発表者の表示の中で示す",
    (_role, index, text, otherText) => {
      const active = { ...sharing, status: "active" as const, currentIndex: 0 };
      render(
        <RoomBoardHeader
          {...setupProps({
            phase: buildPhaseStep(2),
            currentUserId: active.order[index].userId,
          })}
          {...{
            sharing: active,
            onSharingStart: vi.fn(),
            onSharingAdvance: vi.fn(),
          }}
        />,
      );
      const banner = screen.getByTestId("sharing-current-presenter");
      expect(banner).toHaveTextContent(text);
      expect(banner).not.toHaveTextContent(otherText);
    },
  );
  it("共有が終わったら発表者の表示を消す", () => {
    render(
      <RoomBoardHeader
        {...setupProps({ phase: buildPhaseStep(2) })}
        {...{
          sharing: {
            ...sharing,
            status: "complete" as const,
            currentIndex: null,
            results: sharing.order.map(() => "done" as const),
          },
          onSharingStart: vi.fn(),
          onSharingAdvance: vi.fn(),
        }}
      />,
    );
    expect(
      screen.queryByTestId("sharing-current-presenter"),
    ).not.toBeInTheDocument();
  });
});

it("別画面で共有が開始されたらその持ち時間で交代を表示する", () => {
  const ready = buildSharingState();
  const props = {
    ...setupProps({
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
  localStorage.setItem(
    stepGuideSeenStorageKey(sharing.order.at(-1)?.userId ?? ME, "1-2"),
    "seen",
  );
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
  const next = screen.getByRole("button", { name: "次のステップへ" });
  expect(next).toBeEnabled();
  expect(next).toHaveTextContent("次のステップへ");
  expect(
    screen.queryByRole("button", { name: "できた！" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "次のステップへ" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "できた！" }),
  ).not.toBeInTheDocument();
});
it("発表者以外は完了を押せず、計時中でも順番メニューから今の発表者をパスできる", () => {
  const sharing = buildSharingState({ status: "active", currentIndex: 1 });
  const onSharingAdvance = vi.fn();
  render(
    <RoomBoardHeader
      {...setupProps({
        phase: buildPhaseStep(2),
        timer: {
          status: "running",
          durationMs: 180_000,
          endsAt: Date.now() + 60_000,
        },
      })}
      sharing={sharing}
      onSharingAdvance={onSharingAdvance}
    />,
  );
  expect(screen.getByRole("button", { name: "できた！" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "今回はパス" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "発表者と全体の順番を確認" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: `${sharing.order[1].name}をパス` }),
  );
  fireEvent.click(screen.getByRole("button", { name: "パスする" }));
  expect(onSharingAdvance).toHaveBeenCalledExactlyOnceWith("passed");
});

it.each([{ phaseRevision: 2 }, { isDisconnected: true }])(
  "共有中のメニューで開いた確認も状態変更 %j で破棄する",
  (changed) => {
    const props = setupProps({
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
  it("HUDにホストの案内を表示しない: isHost=%s", () => {
    setup({});
    const context = screen.getByTestId("board-context-hud");
    expect(context).not.toHaveTextContent("ホスト：進行はあなたが操作");
    expect(context).not.toHaveTextContent("参加者：次への進行はホストが操作");
    expect(
      within(context).queryByRole("button", { name: "ゴールと進行" }),
    ).not.toBeInTheDocument();
  });
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
  expect(
    screen.queryByRole("button", { name: "今回はパス" }),
  ).not.toBeInTheDocument();
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
    phase: buildPhaseStep(2),
    sharing: buildSharingState({ status: "active", currentIndex: 2 }),
    onNextPhase,
  });

  expect(screen.queryByTestId("sharing-advance")).not.toBeInTheDocument();
  const finishSharing = screen.getByRole("button", { name: "できた！" });
  expect(finishSharing).toBeInTheDocument();
  expect(finishSharing).toHaveAttribute(
    "title",
    "発表を終えて共有を完了します",
  );

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
    setup({ hmwDecidedIssue: "非公開内容をpayloadへ入れない" });
    openRoomMenu();
    fireEvent.click(screen.getByRole("button", { name: "招待" }));
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "招待リンクを共有" }),
    );
    expect(share).toHaveBeenCalledExactlyOnceWith({
      url: "https://idea-flow.example/invite/AB12CD",
    });
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
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
  const props = setupProps({});
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
  const props = setupProps({
    roomName: "J05",
    onRenameRoom,
    onEditSelf: vi.fn(),
  });
  const { rerender } = render(<RoomBoardHeader {...props} />);
  openRoomMenu();
  const roomNameText = within(
    screen.getByRole("dialog", { name: "ルームメニュー" }),
  ).getByText("J05");
  expect(roomNameText).toBeInTheDocument();
  // テーマのテキスト自体をクリックしても変更モーダルを開ける。
  fireEvent.click(roomNameText);
  expect(onRenameRoom).toHaveBeenCalledOnce();
  openRoomMenu();
  const selfButton = screen.getByRole("button", { name: /表示名を変更/ });
  expect(selfButton).toHaveClass("py-2");
  expect(selfButton).not.toHaveClass("border-b");
  expect(selfButton).not.toHaveClass("pb-3");
  rerender(<RoomBoardHeader {...props} outcomePublished />);
  openRoomMenu();
  expect(
    screen.queryByRole("button", { name: /テーマを変更/ }),
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
        screen.getByRole("button", { name: "あと2人で次へ" }),
      ).toHaveAttribute("aria-disabled", "true");
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

describe("全員がそろう前の次へ", () => {
  const pending = (
    members: ReturnType<typeof buildMembers>,
    readyIds: string[],
  ) => ({
    ...allReadyProgress(members),
    readyUserIds: readyIds,
    notReadyUserIds: members
      .map((m) => m.userId)
      .filter((id) => !readyIds.includes(id)),
    canAdvance: false,
    allReady: false,
  });
  it("本人が未完了なら「あと2人で次へ」を押すと、完了も進行も送らず「できた！」へ移って促す", () => {
    const members = buildMembers(3, ME);
    const props = setup({
      members,
      onToggleReady: vi.fn(),
      progress: pending(members, [members[1].userId]),
    });
    const next = screen.getByRole("button", { name: "あと2人で次へ" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(next);
    expect(props.onToggleReady).not.toHaveBeenCalled();
    expect(props.onNextPhase).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const ready = screen.getByRole("button", { name: "できた！" });
    expect(ready).toHaveFocus();
    expect(ready).toBeEnabled();
    expect(screen.getByTestId("board-control-hud")).toHaveAttribute(
      "data-completion-cue",
      "nudge",
    );
  });
  it("本人が完了済みなら「あと1人で次へ」を押すと、進行を送らず未完了の参加者を示す", () => {
    const members = buildMembers(2, ME);
    const props = setup({
      members,
      onToggleReady: vi.fn(),
      progress: pending(members, [ME]),
    });
    fireEvent.click(screen.getByRole("button", { name: "あと1人で次へ" }));
    expect(props.onToggleReady).not.toHaveBeenCalled();
    expect(props.onNextPhase).not.toHaveBeenCalled();
    expect(screen.getByTestId("board-control-hud")).toHaveAttribute(
      "data-completion-cue",
      "others",
    );
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
    name: "全票使うと次へ",
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

it("3-3から追加執筆の3-1へ移っても、マップ位置を保ったまま共通の配置を更新し続ける", () => {
  const props = setupProps({ phase: buildPhaseStep(3, 3) });
  const { rerender } = render(
    <div data-testid="room-board-view-root">
      <RoomBoardHeader {...props} />
    </div>,
  );
  const board = screen.getByTestId("room-board-view-root");
  const header = screen.getByTestId("board-header-row");
  const mapTop = board.style.getPropertyValue("--board-map-top");
  expect(mapTop).not.toBe("");
  expect(header.style.getPropertyValue("--board-location-height")).not.toBe("");
  rerender(
    <div data-testid="room-board-view-root">
      <RoomBoardHeader
        {...props}
        phase={buildPhaseStep(1, 3)}
        isAdditionalWriting
      />
    </div>,
  );
  expect(board.style.getPropertyValue("--board-map-top")).toBe(mapTop);
  expect(header.style.getPropertyValue("--board-location-height")).not.toBe("");
  header.style.removeProperty("--board-location-height");
  fireEvent.resize(window);
  expect(header.style.getPropertyValue("--board-location-height")).not.toBe("");
});

describe("今のフェーズのステップの並び", () => {
  it("開く操作なしに、済んだステップを完了・今のステップを現在として並べる", () => {
    setup({ phase: buildPhaseStep(2, 1) });
    const trail = screen.getByRole("list", { name: "①課題のステップ" });
    const items = within(trail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "個人",
      "共有",
      "整理",
      "投票",
      "決定",
    ]);
    expect(within(items[0]).getByRole("img", { name: "完了" })).toBeTruthy();
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(within(items[1]).queryByRole("img", { name: "完了" })).toBeNull();
    expect(items[2].getAttribute("aria-current")).toBeNull();
    expect(within(items[2]).queryByRole("img", { name: "完了" })).toBeNull();
  });

  it("3つ目のフェーズでは、そのフェーズのステップだけを並べる", () => {
    setup({ phase: buildPhaseStep(3, 3) });
    const trail = screen.getByRole("list", { name: "③アイデアのステップ" });
    const items = within(trail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "個人",
      "共有",
      "2軸評価",
      "投票",
      "決定",
    ]);
    expect(within(trail).getAllByRole("img", { name: "完了" })).toHaveLength(2);
    expect(items[2].getAttribute("aria-current")).toBe("step");
  });
});

it("2軸マップのステップでは、テーマの折り返しで現在地の欄が伸びたらマップ位置を測り直す", () => {
  const observed: Element[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(element: Element): void {
        observed.push(element);
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  setup({ phase: buildPhaseStep(2, 3), roomName: "J05" });
  expect(observed).toContain(screen.getByTestId("board-context-hud"));
});
