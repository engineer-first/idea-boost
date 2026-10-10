import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Toaster } from "@/components/ui/sonner";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildCarryover,
  buildDecision,
  buildMembers,
  buildNotes,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { NoteDraftRecovery } from "@/features/notes";
import { roomNotify } from "../logic/room-notify";
import { useBoardHelp } from "../logic/use-board-help";
import { RoomBoardView } from "./room-board-view";
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

const meta = {
  ...boardMeta,
  title: "Room/RoomBoardLayout",
  component: RoomBoardView,
  parameters: { layout: "fullscreen", chromatic: { viewports: [1280] } },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomBoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

function step(phase: 1 | 2 | 3, value: number): Story {
  return {
    name: `${phase}-${value}`,
    args: {
      phase: buildPhaseStep(value, phase),
      notes: value === 1 ? [] : buildNotes(3),
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
      members: buildMembers(12, boardMeta.args.currentUserId),
      interactions: {
        ...boardMeta.args.interactions,
        privateNotes: PRIVATE_NOTES,
      },
      timer: { status: "paused", remainingMs: 138_000, durationMs: 180_000 },
      initialGuideState: "detail",
    },
  };
}
export const Phase1Step1: Story = step(1, 1);
export const Phase1Step2: Story = step(1, 2);
export const Phase1Step3: Story = step(1, 3);
export const Phase1Step4: Story = step(1, 4);
export const Phase1Step5: Story = step(1, 5);
export const Phase2Step1: Story = step(2, 1);
export const Phase2Step1WithGuide: Story = {
  ...Phase2Step1,
  name: "問い作成の詳細ガイド",
  args: { ...Phase2Step1.args, initialGuideState: "detail" },
};
export const Phase2Step2: Story = step(2, 2);
export const Phase2Step3: Story = step(2, 3);
export const Phase2Step4: Story = step(2, 4);
export const Phase3Step1: Story = step(3, 1);
export const Phase3Step2: Story = step(3, 2);
export const Phase3Step3: Story = step(3, 3);
export const Phase3Step4: Story = step(3, 4);
export const Phase3Step5: Story = step(3, 5);
export const ReferenceAndNotes: Story = {
  ...step(3, 1),
  name: "支援とマイ付箋を同時表示",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "マイ付箋を閉じる" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "マイ付箋を開く" }),
    );
    await expect(canvas.getByTestId("board-help-panel")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "マイ付箋を閉じる" }),
    ).toHaveAttribute("aria-expanded", "true");
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

// 各1幅だけを追加するため、全件撮影時の増分は2スナップショット。
export const LaptopWidth: Story = {
  ...ReferenceAndNotes,
  name: "1024pxの上部と左右パネル",
  parameters: { chromatic: { viewports: [1024] } },
};
export const NarrowWidth: Story = {
  ...ReferenceAndNotes,
  name: "768pxの現在地と主要操作",
  parameters: { chromatic: { viewports: [768] } },
};

export const DecisionsAndNotes: Story = {
  ...ReferenceAndNotes,
  name: "進め方と課題・問いを同時に参照",
  play: async (context) => {
    await ReferenceAndNotes.play?.(context);
    await userEvent.click(
      within(context.canvasElement).getByText("決定した課題"),
    );
    await userEvent.click(
      within(context.canvasElement).getByRole("button", { name: "進め方" }),
    );
  },
};
export const ContextCollapsed: Story = {
  ...ReferenceAndNotes,
  name: "進め方を閉じて問いを参照しながら作業",
  args: { ...ReferenceAndNotes.args, initialGuideState: "compact" },
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
    initialGuideState: "compact",
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
    initialGuideState: "compact",
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
  ...step(2, 1),
  name: "自動除外の通知を残して次工程へ",
  args: { ...step(2, 1).args, initialGuideState: "compact" },
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
  args: { ...AuthRequired.args, initialGuideState: "compact" },
  parameters: { chromatic: { viewports: [320, 390, 1280] } },
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
