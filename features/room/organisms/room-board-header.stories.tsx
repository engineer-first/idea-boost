import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { PhaseProgress } from "@/contracts/room-protocol";
import {
  buildMembers,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { RoomBoardHeader } from "./room-board-header";
import { buildPausedTimer } from "./room-timer.fixture";

const ME = "11111111-1111-4111-8111-111111111111";
const STEP_1_1 = buildPhaseStep(1);
const STEP_1_4 = buildPhaseStep(4);
const STEP_1_5 = buildPhaseStep(5);
const STEP_2_2 = buildPhaseStep(2, 2);
const STEP_3_4 = buildPhaseStep(4, 3);
const STEP_3_5 = buildPhaseStep(5, 3);
const VOTING_MEMBERS = buildMembers(3, ME);
const HUD_MEMBERS = buildMembers(12, ME);

function completedProgress(
  members: readonly { userId: string }[],
): PhaseProgress {
  const ids = members.map(({ userId }) => userId);
  return {
    phaseRevision: 1,
    progressRevision: 1,
    connectedUserIds: ids,
    readyUserIds: ids,
    notReadyUserIds: [],
    canAdvance: true,
    allReady: true,
  };
}

const meta = {
  title: "Room/RoomBoardHeader",
  component: RoomBoardHeader,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    roomName: "J05",
    onRenameRoom: fn(),
    hmwDecidedIssue: null,
    decidedHmw: null,
    inviteCode: "AB12CD",
    inviteUrl: "https://idea-flow.example/invite/AB12CD",
    phase: STEP_1_1,
    timer: { status: "idle" },
    timerServerOffsetMs: 0,
    isHost: true,
    isDisconnected: false,
    connectionStatus: "open",
    members: buildMembers(3, ME),
    currentUserId: ME,
    hostUserId: ME,
    isNextPhasePending: false,
    isNextPhaseBlocked: false,
    hasFinalDecision: false,
    outcomePublished: false,
    onPublishOutcome: fn(),
    onOpenFeedback: fn(),
    signOutAction: fn(),
    isLeaving: false,

    onLeaveClick: fn(),
    onNextPhase: fn(),
    onToggleReady: fn(),
    onTimerStart: fn(),
    onTimerPause: fn(),
    onTimerResume: fn(),
    onTimerExtend: fn(),
    onTimerStop: fn(),
  },
  decorators: [
    (Story, context) => {
      const sessionKey = `step-onboarding:${context.args.inviteCode}:${context.args.currentUserId}:1-1`;
      if (context.parameters.firstVisitOnboarding) {
        window.sessionStorage.removeItem(sessionKey);
      } else {
        window.sessionStorage.setItem(sessionKey, "seen");
      }
      return (
        <div
          data-testid="room-board-view-root"
          className="relative min-h-screen overflow-hidden bg-muted/20"
        >
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof RoomBoardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

// ホスト視点（招待情報・フェーズ移行・解散が全部見える）。
export const Host: Story = {};

export const ProgressControls: Story = {
  args: {
    phase: buildPhaseStep(3),
    members: buildMembers(1, ME),
    timer: {
      status: "running",
      endsAt: Date.now() + 600_000,
      durationMs: 600_000,
    },
  },
  render: function Render(args) {
    const [ready, setReady] = useState(false);
    const progress = completedProgress(args.members);
    return (
      <RoomBoardHeader
        {...args}
        progress={
          ready
            ? progress
            : {
                ...progress,
                readyUserIds: [],
                notReadyUserIds: [ME],
                canAdvance: false,
                allReady: false,
              }
        }
        onToggleReady={setReady}
      />
    );
  },
};

// 参加者視点（招待情報とフェーズ移行が出ない）。
export const NonHost: Story = {
  args: {
    isHost: false,
    hostUserId: buildMembers(3, ME).find((m) => m.userId !== ME)?.userId ?? ME,
  },
};

export const CollapsedGuide: Story = {
  args: {},
};

// 3フェーズの現在地と、フェーズ別の5/4/5ステップ進捗を確認する。
export const PhaseTwoProgress: Story = {
  args: {
    phase: STEP_2_2,
  },
};

export const PhaseThreeProgress: Story = {
  args: {
    phase: STEP_3_4,
  },
};

// 狭いカード幅でも上段のフェーズ名が省略されず、下段と分離して読める。
export const NarrowPhaseProgress: Story = {
  args: {
    phase: STEP_2_2,
  },
  decorators: [
    (Story) => (
      <div className="relative h-96 w-[280px] overflow-hidden bg-muted/20">
        <Story />
      </div>
    ),
  ],
};

// loading相当: WebSocket 接続の確立中（操作が無効化される）。
export const Connecting: Story = {
  args: {
    isDisconnected: true,
    connectionStatus: "connecting",
  },
};

// error相当: 切断からの自動再接続待ち。
export const Reconnecting: Story = {
  args: {
    isDisconnected: true,
    connectionStatus: "closed",
  },
};

// Step 1-5: 結果は付箋上で確認し、採用するまで進行を止める。
export const VoteTotaled: Story = {
  args: {
    phase: STEP_1_5,
  },
};

export const OutcomePublished: Story = {
  args: {
    onEditSelf: fn(),
    phase: STEP_3_5,
    hasFinalDecision: true,
    hasCurrentDecision: true,
    outcomePublished: true,
  },
};

export const FinalDecisionPending: Story = {
  args: {
    phase: STEP_3_5,
    hasFinalDecision: true,
    hasCurrentDecision: true,
  },
};

// Step 1-4: ステルス投票中は個別の票を他者へ表示しない。
export const StealthVoting: Story = {
  args: {
    phase: STEP_1_4,
  },
};

// 投票ステップで全員が完了した状態。
export const VotingComplete: Story = {
  args: {
    phase: STEP_1_4,
    members: VOTING_MEMBERS,
    completedVoterIds: VOTING_MEMBERS.map(({ userId }) => userId),
    progress: completedProgress(VOTING_MEMBERS),
  },
};

// 解散処理中（多重押下防止）。
export const Leaving: Story = {
  args: {
    isLeaving: true,
  },
};

// タイマーが一時停止中（公開Storybookで残り時間を固定して確認できる）。
export const TimerPaused: Story = {
  args: {
    timer: buildPausedTimer(),
  },
};

export const VoteResultAwaitingDecision: Story = {
  args: { phase: STEP_1_5, isNextPhaseBlocked: true, members: HUD_MEMBERS },
};
export const VoteResultDecided: Story = {
  args: {
    ...VoteResultAwaitingDecision.args,
    hasCurrentDecision: true,
    isNextPhaseBlocked: false,
  },
};
export const HmwResultDecided: Story = {
  args: { ...VoteResultDecided.args, phase: buildPhaseStep(4, 2) },
};
export const IdeaVoting: Story = {
  args: { phase: STEP_3_4, members: HUD_MEMBERS },
};
export const IdeaResultAwaitingDecision: Story = {
  args: { phase: STEP_3_5, isNextPhaseBlocked: true, members: HUD_MEMBERS },
};

export const IdeaResultDecided: Story = {
  args: {
    ...IdeaResultAwaitingDecision.args,
    timer: { status: "ended", durationMs: 180_000 },
    hasFinalDecision: true,
    hasCurrentDecision: true,
    isNextPhaseBlocked: false,
  },
};

export const IdeaVotingComplete: Story = {
  args: {
    phase: STEP_3_4,
    members: HUD_MEMBERS,
    completedVoterIds: HUD_MEMBERS.map(({ userId }) => userId),
    progress: completedProgress(HUD_MEMBERS),
  },
};

export const VotingHud: Story = {
  args: { phase: STEP_1_4, members: HUD_MEMBERS },
};
export const VotingCompleteHud: Story = {
  args: {
    phase: STEP_1_4,
    members: HUD_MEMBERS,
    completedVoterIds: HUD_MEMBERS.map(({ userId }) => userId),
    progress: completedProgress(HUD_MEMBERS),
  },
};

// 少人数・参加者視点・停止中タイマーでも完了表示が操作を動かさない。
export const VotingNonHostPaused: Story = {
  args: {
    phase: STEP_1_4,
    isHost: false,
    members: VOTING_MEMBERS,
    timer: buildPausedTimer(),
  },
};
export const VotingCompleteNonHostPaused: Story = {
  args: {
    ...VotingNonHostPaused.args,
    completedVoterIds: VOTING_MEMBERS.map(({ userId }) => userId),
    progress: completedProgress(VOTING_MEMBERS),
  },
};
export const VoteResultNonHostPaused: Story = {
  args: { ...VotingNonHostPaused.args, phase: STEP_1_5 },
};

const SHARING_MEMBERS = buildMembers(3, ME);
export const PresentingMember: Story = {
  args: {
    phase: buildPhaseStep(2),
    isHost: false,
    currentUserId: SHARING_MEMBERS[1].userId,
    sharing: buildSharingState({
      order: SHARING_MEMBERS,
      status: "active",
      currentIndex: 1,
    }),
    onSharingAdvance: fn(),
  },
};

export const SharingCompletion: Story = {
  args: { ...PresentingMember.args, members: buildMembers(2, ME) },
  render: function Render(args) {
    const [phase, setPhase] = useState(buildPhaseStep(2));
    const [sharing, setSharing] = useState(() =>
      buildSharingState({
        order: args.members,
        status: "active",
        currentIndex: 0,
        startsAt: null,
      }),
    );
    return (
      <RoomBoardHeader
        {...args}
        phase={phase}
        sharing={phase.step === 2 ? sharing : null}
        currentUserId={sharing.order[sharing.currentIndex ?? 0].userId}
        timer={
          phase.step === 2
            ? {
                status: "running",
                endsAt: Date.now() + 180_000,
                durationMs: 180_000,
              }
            : { status: "idle" }
        }
        onSharingAdvance={(outcome) => {
          const next = (sharing.currentIndex ?? 0) + 1;
          if (next >= sharing.order.length) setPhase(buildPhaseStep(3));
          else
            setSharing({
              ...sharing,
              currentIndex: next,
              revision: crypto.randomUUID(),
              results: [...sharing.results, outcome],
            });
        }}
      />
    );
  },
};
export const WaitingMember: Story = {
  args: { ...PresentingMember.args, currentUserId: SHARING_MEMBERS[2].userId },
};
export const PresenterTransitioning: Story = {
  args: {
    ...PresentingMember.args,
    sharing: buildSharingState({
      order: SHARING_MEMBERS,
      status: "active",
      currentIndex: 1,
      startsAt: Date.now() + 2000,
    }),
  },
};
export const PresenterDisconnected: Story = {
  args: {
    ...PresentingMember.args,
    isDisconnected: true,
    connectionStatus: "closed",
  },
};

// 常設の操作バーから招待を外し、既存メニュー項目と揃えた招待入口。
export const ShareMenu: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "ルームメニューを開く",
      }),
    );
    await expect(
      within(document.body).getByRole("button", { name: "招待" }),
    ).toBeVisible();
  },
};

export const ShareInvite: Story = {
  play: async (context) => {
    await ShareMenu.play?.(context);
    await userEvent.click(
      within(document.body).getByRole("button", { name: "招待" }),
    );
    await expect(
      within(document.body).getByRole("button", { name: "招待URLをコピー" }),
    ).toBeVisible();
  },
};

export const FinalCompletionConfirmation: Story = {
  args: { ...FinalDecisionPending.args },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "完了して成果を表示" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("alertdialog"),
    ).toBeVisible();
  },
};
export const FinalCompletionDisconnected: Story = {
  args: {
    ...FinalDecisionPending.args,
    isDisconnected: true,
    connectionStatus: "reconnecting",
  },
};

export const TimeUpProgress: Story = {
  args: {
    members: buildMembers(5, ME),
    timer: { status: "ended", durationMs: 300_000 },
    progress: {
      phaseRevision: 0,
      progressRevision: 0,
      connectedUserIds: buildMembers(5, ME).map((m) => m.userId),
      readyUserIds: [],
      notReadyUserIds: buildMembers(5, ME).map((m) => m.userId),
      canAdvance: false,
      allReady: false,
    },
  },
  render: function Render(args) {
    const [count, setCount] = useState(0);
    return (
      <>
        <RoomBoardHeader {...args} onNextPhase={() => setCount((v) => v + 1)} />
        <output className="sr-only" data-testid="phase-next-count">
          {count}
        </output>
      </>
    );
  },
};
export const TimeUpProgressPending: Story = {
  ...TimeUpProgress,
  args: { ...TimeUpProgress.args, isNextPhasePending: true },
};
