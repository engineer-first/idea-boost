import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomBoardHeader } from "./room-board-header";
import { buildPausedTimer } from "./room-timer.fixture";

const ME = "11111111-1111-4111-8111-111111111111";
const STEP_1_1 = buildPhaseStep(1);
const STEP_1_4 = buildPhaseStep(4);
const STEP_1_5 = buildPhaseStep(5);
const STEP_3_5 = buildPhaseStep(5, 3);

const meta = {
  title: "Room/RoomBoardHeader",
  component: RoomBoardHeader,
  parameters: {
    layout: "fullscreen",
  },
  args: {
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
    isGuideExpanded: true,
    isSprintComplete: false,
    signOutAction: fn(),
    isLeaving: false,
    onShowVoteResult: fn(),
    onGuideExpandedChange: fn(),
    onLeaveClick: fn(),
    onNextPhase: fn(),
    onTimerStart: fn(),
    onTimerPause: fn(),
    onTimerResume: fn(),
    onTimerExtend: fn(),
    onTimerStop: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative h-96 overflow-hidden bg-muted/20">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomBoardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

// ホスト視点（招待情報・フェーズ移行・解散が全部見える）。
export const Host: Story = {};

// 参加者視点（招待情報とフェーズ移行が出ない）。
export const NonHost: Story = {
  args: {
    isHost: false,
    hostUserId: buildMembers(3, ME).find((m) => m.userId !== ME)?.userId ?? ME,
  },
};

export const CollapsedGuide: Story = {
  args: {
    isGuideExpanded: false,
  },
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

// Step 1-5: 投票結果ボタンが現れ、ステップ移行は打ち止めになる。
export const VoteTotaled: Story = {
  args: {
    phase: STEP_1_5,
  },
};

export const SprintComplete: Story = {
  args: {
    phase: STEP_3_5,
    isSprintComplete: true,
  },
};

// Step 1-4: ステルス投票中は投票結果ボタンをまだ表示しない。
export const StealthVoting: Story = {
  args: {
    phase: STEP_1_4,
  },
};

// 解散処理中（多重押下防止）。
export const Leaving: Story = {
  args: {
    isLeaving: true,
  },
};

// タイマーが一時停止中（決定的な残り時間表示。Chromatic の差分を安定させる）。
export const TimerPaused: Story = {
  args: {
    timer: buildPausedTimer(),
  },
};
