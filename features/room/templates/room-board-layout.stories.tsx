import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { startTransition, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Toaster } from "@/components/ui/sonner";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { PhaseProgress } from "@/contracts/room-protocol";
import {
  buildCarryover,
  buildDecision,
  buildMembers,
  buildNotes,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { HMW_EXAMPLES } from "@/features/hmw";
import { NoteDraftRecovery } from "@/features/notes";
import { roomNotify } from "../logic/room-notify";
import { useBoardHelp } from "../logic/use-board-help";
import { RoomBoardView, type RoomBoardViewProps } from "./room-board-view";
import boardMeta, { MoveHistoryAvailable } from "./room-board-view.stories";

const LONG_ISSUE =
  "チームで何を作るか決めるとき、発言が得意な人の意見だけで進んでしまい、初めて参加する学生が自分の困りごとや案を出せない。全員が自分の考えを伝え、互いの案を比べられるようにしたい。";
const LONG_QUESTION =
  "どうすれば私たちは、初参加の学生も安心して自分の考えを書き出し、全員の案を根拠とともに比較して、納得できるアイデアを選べるだろうか？";
const PRIVATE_NOTES = buildNotes(20).map((note, index) => ({
  ...note,
  visibility: "private" as const,
  content: `${index + 1}. 参加者全員が安心して書ける時間をつくり、困っている場面と解決案を一つずつ比べる。`,
}));

const VOTED_NOTES = buildNotes(3).map((note) => ({
  ...note,
  dotVotes: {
    ...note.dotVotes,
    subjective: { ...note.dotVotes.subjective, count: 1 },
  },
}));

function allReadyProgress(
  members: ReadonlyArray<{ userId: string }>,
): PhaseProgress {
  const userIds = members.map(({ userId }) => userId);
  return {
    phaseRevision: 1,
    progressRevision: 1,
    connectedUserIds: userIds,
    readyUserIds: userIds,
    notReadyUserIds: [],
    canAdvance: true,
    allReady: true,
  };
}

const meta = {
  ...boardMeta,
  title: "Room/RoomBoardLayout",
  component: RoomBoardView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      const sessionKey = `step-onboarding:${context.args.inviteCode}:${context.args.currentUserId}:1-1`;
      if (context.parameters.firstVisitOnboarding) {
        window.sessionStorage.removeItem(sessionKey);
      } else {
        window.sessionStorage.setItem(sessionKey, "seen");
      }
      return (
        <div style={{ height: "100dvh", overflow: "hidden" }}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof RoomBoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

function PhaseHandoffPreview(args: RoomBoardViewProps) {
  const [phase, setPhase] = useState(args.phase);
  const help = useBoardHelp(phase);

  return (
    <RoomBoardView
      {...args}
      phase={phase}
      help={help}
      onNextPhase={() =>
        startTransition(() =>
          setPhase(buildPhaseStep(2, phase.kind === "step" ? phase.phase : 1)),
        )
      }
    />
  );
}

function handoffStory(phase: 1 | 2 | 3): Story {
  return {
    ...step(phase, 1),
    name: `${phase}-1から${phase}-2への移行アニメーション`,
    render: (args) => <PhaseHandoffPreview {...args} />,
  };
}

function step(
  phase: 1 | 2 | 3,
  value: number,
  options: { hasNotReadyMember?: boolean } = {},
): Story {
  const members = buildMembers(12, boardMeta.args.currentUserId);
  return {
    name: `${phase}-${value}`,
    args: {
      phase: buildPhaseStep(value, phase),
      notes: value === 1 ? [] : buildNotes(3),
      exampleNotes: phase === 2 && value === 1 ? HMW_EXAMPLES : [],
      hmwDecidedIssue: phase >= 2 ? LONG_ISSUE : null,
      issueReference:
        phase >= 2
          ? buildCarryover({
              content: LONG_ISSUE,
              color: "pink",
              fontSize: 18,
              dotVotes: { subjective: 3, objective: 2 },
            })
          : null,
      hmwReference:
        phase === 3
          ? buildCarryover({
              phase: 2,
              content: LONG_QUESTION,
              color: "blue",
              fontSize: 16,
              dotVotes: { subjective: 4, objective: 1 },
            })
          : null,
      decidedHmw: phase === 3 ? LONG_QUESTION : null,
      members,
      progress: options.hasNotReadyMember
        ? {
            ...allReadyProgress(members),
            readyUserIds: members.slice(0, -1).map(({ userId }) => userId),
            notReadyUserIds: members.slice(-1).map(({ userId }) => userId),
            allReady: false,
          }
        : allReadyProgress(members),
      interactions: {
        ...boardMeta.args.interactions,
        privateNotes: PRIVATE_NOTES,
      },
      timer: {
        status: "running",
        endsAt: Date.now() + 138_000,
        durationMs: 180_000,
      },
    },
  };
}
export const Phase1Step1: Story = step(1, 1);
export const FirstVisitOnboarding: Story = {
  ...Phase1Step1,
  name: "1-1 初回案内",
  parameters: { firstVisitOnboarding: true },
};
export const Phase1Step1ToStep2: Story = handoffStory(1);
export const Phase1Step2: Story = step(1, 2);
export const Phase1Step3: Story = step(1, 3);
export const Phase1Step3WithNotReadyMember: Story = {
  ...step(1, 3, { hasNotReadyMember: true }),
  name: "1-3 未完了メンバーあり",
};
export const Phase1Step4: Story = step(1, 4);
export const Phase1Step5: Story = step(1, 5);
export const Phase2Step1: Story = step(2, 1);
export const Phase2Step1ToStep2: Story = handoffStory(2);
export const Phase2Step1WithGuide: Story = {
  ...Phase2Step1,
  name: "問い作成の詳細ガイド",
  args: { ...Phase2Step1.args },
};
export const Phase2Step2: Story = step(2, 2);
export const Phase2Step3: Story = step(2, 3);
export const Phase2Step4: Story = step(2, 4);
export const Phase3Step1: Story = step(3, 1);
export const Phase3Step1ToStep2: Story = handoffStory(3);
export const Phase3Step2: Story = {
  ...step(3, 2),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("complementary", { name: "考えるヒント" }),
    ).not.toBeInTheDocument();
  },
};
export const Phase3Step3: Story = step(3, 3);
export const Phase3Step3WithNotReadyMember: Story = {
  ...step(3, 3, { hasNotReadyMember: true }),
  name: "3-3 未完了メンバーあり",
};
export const Phase3Step4: Story = step(3, 4);
export const Phase3Step5: Story = step(3, 5);
export const ReferenceAndNotes: Story = {
  ...step(3, 1),
  name: "支援とマイ付箋を同時表示",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("private-notes-toolbar")).toHaveAttribute(
      "data-presentation",
      "workspace",
    );
    await expect(canvas.getByTestId("board-help-panel")).toBeVisible();
  },
};
export const Focused: Story = {
  ...step(3, 1),
  name: "補助情報を閉じて作業",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "考えるヒントを閉じる" }),
    );
  },
};
export const Reconnecting: Story = {
  ...step(3, 1),
  name: "再接続中",
  args: { ...step(3, 1).args, connectionStatus: "closed" },
};
export const Participant: Story = {
  ...step(3, 1),
  name: "参加者",
  args: { ...step(3, 1).args, isHost: false },
};

export const Completed: Story = {
  ...step(3, 5),
  name: "成果公開後",
  args: {
    ...step(3, 5).args,
    notes: VOTED_NOTES,
    decision: buildDecision({ phase: 3, noteId: VOTED_NOTES[0].id }),
    outcomePublished: true,
  },
};

export const FinalDecisionPending: Story = {
  ...Completed,
  name: "採用案決定後・公開前",
  args: { ...Completed.args, outcomePublished: false },
};

// browserテストがstory名に対応する1024px / 768pxの幅で操作・配置を検査する。
export const LaptopWidth: Story = {
  ...ReferenceAndNotes,
  name: "1024pxの上部と左右パネル",
};
export const NarrowWidth: Story = {
  ...ReferenceAndNotes,
  name: "768pxの現在地と主要操作",
};

export const DecisionsAndNotes: Story = {
  ...ReferenceAndNotes,
  name: "決定した課題と問いを同時に参照",
  play: async (context) => {
    await ReferenceAndNotes.play?.(context);
    await userEvent.click(
      within(context.canvasElement).getByText("決定した課題"),
    );
  },
};
export const ContextCollapsed: Story = {
  ...ReferenceAndNotes,
  name: "参照欄を閉じて問いを参照しながら作業",
  args: { ...ReferenceAndNotes.args },
};

export const SingleParticipant: Story = {
  ...ReferenceAndNotes,
  name: "参加者が1人のときの左右パネル",
  args: {
    ...step(3, 1).args,
    isHost: false,
    members: buildMembers(1, boardMeta.args.currentUserId),
  },
};

export const InviteOpen: Story = {
  ...step(3, 1),
  name: "操作バーから招待",
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "招待" }),
    );
  },
};
export const TimerOpen: Story = {
  ...step(3, 1),
  name: "操作バーからタイマー設定",
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("room-timer"));
  },
};

export const TimerPaused: Story = {
  ...step(3, 1),
  name: "タイマー一時停止中",
  args: {
    ...step(3, 1).args,
    timer: {
      status: "paused",
      remainingMs: 138_000,
      durationMs: 180_000,
    },
  },
};

export const Connecting: Story = {
  ...step(3, 1),
  name: "接続確立中",
  args: { ...step(3, 1).args, connectionStatus: "connecting" },
};

export const SharingReady: Story = {
  ...step(1, 2),
  args: {
    ...step(1, 2).args,
    timer: { status: "idle" },
    sharing: buildSharingState(),
  },
};
export const SharingActive: Story = {
  ...SharingReady,
  args: {
    ...SharingReady.args,
    timer: { status: "paused", remainingMs: 138000, durationMs: 180000 },
    sharing: buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
    }),
  },
};
export const MySharingTurn: Story = {
  ...SharingActive,
  name: "自分の発表中・共有可能",
  args: {
    ...SharingActive.args,
    sharing: buildSharingState({ status: "active", currentIndex: 0 }),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "マイ付箋を開く" }),
    );
  },
};
export const WaitingForSharingTurn: Story = {
  ...SharingActive,
  name: "ほかの人の発表中・共有待ち",
  play: MySharingTurn.play,
};
export const SharingTransition: Story = {
  ...SharingReady,
  args: {
    ...SharingReady.args,
    sharing: buildSharingState({
      status: "active",
      currentIndex: 1,
      results: ["done"],
      startsAt: Date.now() + 2000,
    }),
  },
};
export const SharingComplete: Story = {
  ...SharingReady,
  args: {
    ...SharingReady.args,
    sharing: buildSharingState({
      status: "complete",
      results: ["done", "passed", "done"],
    }),
  },
};
export const SharingMember: Story = {
  ...SharingActive,
  args: { ...SharingActive.args, isHost: false },
};

export const MapControls: Story = {
  ...step(3, 3),
  name: "マップと書き足しを操作",
  args: {
    ...step(3, 3).args,
    ideaMapSizeInitialized: true,
  },
  render: function Render(args) {
    const [level, setLevel] = useState(1);
    const help = useBoardHelp(args.phase);
    return (
      <RoomBoardView
        {...args}
        help={help}
        interactions={{ ...args.interactions, notes: args.notes }}
        ideaMapSizeLevel={level}
        onIdeaMapResize={setLevel}
      />
    );
  },
};

export const UndoNotification: Story = {
  ...step(1, 5),
  name: "1-5 決定中の自動除外通知",
  args: { ...step(1, 5).args },
  render: function Render(args) {
    const help = useBoardHelp(args.phase);
    const [undone, setUndone] = useState(false);
    return (
      <>
        <RoomBoardView
          {...args}
          help={help}
          interactions={{ ...args.interactions, notes: args.notes }}
        />
        <Toaster />
        <button
          type="button"
          className="fixed top-3 left-1/2 z-50"
          onClick={() =>
            roomNotify.automaticallyExcludedCandidates(1, () => setUndone(true))
          }
        >
          除外通知を再現
        </button>
        {undone && <p role="status">通知のUndo操作が届きました</p>}
      </>
    );
  },
};

export const UndoNotificationHmw: Story = {
  ...UndoNotification,
  name: "2-4 決定中の自動除外通知",
  args: { ...step(2, 4).args },
};

export const UndoNotificationIdea: Story = {
  ...UndoNotification,
  name: "3-5 決定中の自動除外通知",
  args: { ...step(3, 5).args },
};

export const DelayedConnection: Story = {
  ...Reconnecting,
  name: "接続不調が10秒継続",
  args: { ...Reconnecting.args, connectionDelayed: true },
};

export const AuthRequired: Story = {
  ...DelayedConnection,
  args: { ...DelayedConnection.args, connectionStatus: "auth-required" },
};
export const Unavailable: Story = {
  ...DelayedConnection,
  args: { ...DelayedConnection.args, connectionStatus: "unavailable" },
};
export const AuthRequiredLocationExpanded: Story = {
  ...AuthRequired,
  args: { ...AuthRequired.args },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /現在地/ }),
    );
  },
};
export const AuthRequiredWithMoveHistory: Story = {
  ...AuthRequired,
  args: { ...AuthRequired.args, ...MoveHistoryAvailable.args },
};
const RECOVERY_ITEMS = [
  {
    noteId: "recovered-note",
    text: "接続が戻らなくても、書きかけの文章を消さずに持ち帰れます。",
    reason: "現在は編集できません。",
  },
];
export const AuthRequiredWithDraft: Story = {
  ...AuthRequired,
  decorators: [
    (Story) => (
      <>
        <Story />
        <NoteDraftRecovery items={RECOVERY_ITEMS} />
      </>
    ),
  ],
};
export const UnavailableWithDraft: Story = {
  ...Unavailable,
  decorators: AuthRequiredWithDraft.decorators,
};

export const LongReference: Story = {
  ...step(3, 1),
  args: {
    ...step(3, 1).args,
    decidedHmw: "問いの全文を読みながら考える。".repeat(134).slice(0, 2000),
    hmwReference: buildCarryover({
      phase: 2,
      fontSize: 20,
      color: "green",
      dotVotes: { subjective: 8, objective: 6 },
    }),
  },
};

export const ReconnectingDock: Story = {
  ...step(3, 2),
  args: {
    ...step(3, 2).args,
    connectionStatus: "reconnecting",
    connectionDelayed: true,
  },
};
