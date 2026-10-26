import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Toaster } from "@/components/ui/sonner";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { Decision, PhaseProgress } from "@/contracts/room-protocol";
import {
  buildCarryover,
  buildDecision,
  buildMembers,
  buildNote,
  buildNotes,
  buildSharingState,
} from "@/contracts/room-protocol.fixture";
import { useFeedback } from "@/features/feedback";
import { useBoardHelp } from "../logic/use-board-help";
import { useCanvasCamera } from "../logic/use-canvas-camera";
import {
  type RoomBoardInteractions,
  useRoomBoardInteractions,
} from "../logic/use-room-board-interactions";
import { getBoardFitInsets, RoomBoardView } from "./room-board-view";

const ME = "11111111-1111-4111-8111-111111111111";
const STEP_1_1 = buildPhaseStep(1);
const STEP_1_2 = buildPhaseStep(2);
const STEP_1_3 = buildPhaseStep(3);
const STEP_1_4 = buildPhaseStep(4);
const STEP_1_5 = buildPhaseStep(5);
const STEP_2_1 = buildPhaseStep(1, 2);
const STEP_3_5 = buildPhaseStep(5, 3);
const GUIDE_ISSUE = "会議で発言する人が偏ってしまう";
const GUIDE_QUESTION = "どうすれば全員が安心してアイデアを共有できるだろうか？";
const CANVAS_HUD_POSITIONS = [
  [180, 120],
  [380, 220],
  [630, 280],
  [180, 380],
  [470, 520],
  [850, 410],
] as const;
const CANVAS_HUD_CONTENTS = [
  "ユーザーが最初に何を迷うか？",
  "オンボーディングの離脱ポイントはどこか？",
  "どの機能が最も使われていないか？",
  "価値を感じるまでの時間が長い？",
  "サポートへの問い合わせが多い内容は？",
  "チームで共有しづらい理由は？",
] as const;
const CANVAS_HUD_NOTES = buildNotes(6).map((note, index) => ({
  ...note,
  content: CANVAS_HUD_CONTENTS[index] ?? note.content,
  x: CANVAS_HUD_POSITIONS[index]?.[0] ?? note.x,
  y: CANVAS_HUD_POSITIONS[index]?.[1] ?? note.y,
}));
const INTERACTIONS: RoomBoardInteractions = {
  boardRootRef: { current: null },
  boardScrollerRef: { current: null },
  ideaMapPlaneRef: { current: null },
  privateToolbarRef: { current: null },
  notes: buildNotes(3),
  privateNotes: [],
  dragGhost: null,
  isReturnDropTarget: false,
  isNoteDragging: false,
  camera: { x: 0, y: 0, zoom: 1 },
  gridStyle: {
    backgroundImage:
      "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 1.5px)",
    backgroundPosition: "0 0",
    backgroundSize: "20px 20px",
  },
  isPanning: false,
  onCanvasPointerDown: fn(),
  onCanvasPointerMove: fn(),
  onCanvasPointerEnd: fn(),
  onPresencePointerMove: fn(),
  onPresencePointerLeave: fn(),
  onZoomIn: fn(),
  onZoomOut: fn(),
  onResetZoom: fn(),
  onFitToNotes: fn(),
  onPointerMove: fn(),
  onPointerEnd: fn(),
  onPointerCancel: fn(),
  cancelCurrentNoteDrag: fn(),
  onNoteDragStart: fn(),
  onPrivateNoteDragStart: fn(),
};

const STORY_MEMBERS = buildMembers(3, ME);
const STORY_PROGRESS: PhaseProgress = {
  phaseRevision: 1,
  progressRevision: 1,
  connectedUserIds: STORY_MEMBERS.map(({ userId }) => userId),
  readyUserIds: STORY_MEMBERS.map(({ userId }) => userId),
  notReadyUserIds: [],
  canAdvance: true,
  allReady: true,
};

const meta = {
  title: "Room/RoomBoardView",
  component: RoomBoardView,
  render: function Render(args) {
    const help = useBoardHelp(args.phase);
    return (
      <RoomBoardView
        {...args}
        help={help}
        interactions={{ ...args.interactions, notes: args.notes }}
      />
    );
  },
  argTypes: { help: { control: false } },
  parameters: {
    layout: "fullscreen",
  },
  args: {
    notes: buildNotes(3),
    inviteCode: "AB12CD",
    inviteUrl: "https://idea-flow.example/invite/AB12CD",
    phase: STEP_1_1,
    timer: {
      status: "running",
      endsAt: Date.now() + 60_000,
      durationMs: 60_000,
    },
    timerServerOffsetMs: 0,
    isHost: true,
    hostRevision: 0,
    onTransferHost: fn(),
    decision: null,
    outcomePublished: false,
    connectionStatus: "open",
    draggingNoteId: null,
    members: STORY_MEMBERS,
    progress: STORY_PROGRESS,
    currentUserId: ME,
    hostUserId: ME,
    isNextPhasePending: false,
    signOutAction: fn(),
    interactions: INTERACTIONS,
    help: {
      kind: null,
      isOpen: false,
      tab: "write",
      onOpenChange: fn(),
      onTabChange: fn(),
    },
    hmwDecidedIssue: null,
    decidedHmw: null,
    onAddPrivateNote: fn(),
    onHmwTemplateSelect: fn(),
    onIdeaHintSelect: fn(),
    onPrivateNoteContentChange: fn(),
    onPrivateNoteDelete: fn(),
    onNoteContentChange: fn(),
    onNoteDelete: fn(),
    onNoteBringToFront: fn(),
    onGroupCreate: fn(),
    onGroupUpdateName: fn(),
    groups: [],
    onNoteVote: fn(),
    onNoteVoteRemove: fn(),
    onNoteVoteStickerRemove: fn(),
    onNoteVoteStickerMove: fn(),
    pendingVoteOperations: [],
    voteFeedback: null,
    onNoteDecide: fn(),
    onDecisionClear: fn(),
    onPublishOutcome: fn(),

    onLeave: fn(),
    isLeaving: false,
    onNextPhase: fn(),
    onTimerStart: fn(),
    onTimerPause: fn(),
    onTimerResume: fn(),
    onTimerExtend: fn(),
    onTimerStop: fn(),
    remoteCursors: [],
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
        <div style={{ height: "100vh" }}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof RoomBoardView>;

export default meta;
type Story = StoryObj<typeof meta>;

function guideStory(phase: 1 | 2 | 3, step: number): Story {
  return {
    name: `フェーズ${phase} Step ${step}`,
    args: {
      phase: buildPhaseStep(step, phase),
      notes: step === 1 ? [] : buildNotes(3),
      hmwDecidedIssue: phase >= 2 ? GUIDE_ISSUE : null,
      decidedHmw: phase === 3 ? GUIDE_QUESTION : null,
    },
  };
}

// success相当: 付箋が配置されている状態。
export const WithNotes: Story = {};

// empty相当: ルーム作成直後、まだ誰も付箋を置いていない状態。
export const Empty: Story = {
  args: {
    notes: [],
  },
};

export const PrivateNoteAdditionDelayed: Story = {
  args: {
    phase: STEP_1_1,
    notes: [],
  },
  render: function Render(args) {
    const [privateNotes, setPrivateNotes] = useState([
      buildNote({
        id: "private-writing",
        authorId: ME,
        visibility: "private",
        content: "最初の下書き",
      }),
    ]);
    const [pendingOperationId, setPendingOperationId] = useState<string | null>(
      null,
    );
    const [receipt, setReceipt] = useState<
      { operationId: string; noteId: string } | undefined
    >();
    const pendingRef = useRef<string | null>(null);
    useEffect(() => {
      if (!pendingOperationId) return;
      const timer = window.setTimeout(() => {
        const noteId = crypto.randomUUID();
        setPrivateNotes((current) => [
          ...current,
          buildNote({
            id: noteId,
            authorId: ME,
            visibility: "private",
            content: "",
          }),
        ]);
        setReceipt({ operationId: pendingOperationId, noteId });
        pendingRef.current = null;
        setPendingOperationId(null);
      }, 1800);
      return () => window.clearTimeout(timer);
    }, [pendingOperationId]);
    const interactions = useRoomBoardInteractions({
      notes: [],
      privateNotes,
      currentUserId: ME,
      draggingNoteId: null,
      phase: args.phase,
      getFitInsets: getBoardFitInsets,
      onNoteDragStart: () => undefined,
      onNoteDragMove: () => undefined,
      onNoteDragEnd: () => undefined,
      onNoteDragCancel: () => undefined,
      onPrivateNotePublish: () => undefined,
      onPrivateNoteUnpublish: () => undefined,
      onCursorMove: () => undefined,
      onCursorLeave: () => undefined,
    });
    const help = useBoardHelp(args.phase);
    return (
      <RoomBoardView
        {...args}
        interactions={interactions}
        help={help}
        noteCreationPending={pendingOperationId !== null}
        noteCreationReceipt={receipt}
        onAddPrivateNote={() => {
          if (pendingRef.current) return null;
          const operationId = crypto.randomUUID();
          pendingRef.current = operationId;
          setPendingOperationId(operationId);
          return operationId;
        }}
        onPrivateNoteContentChange={(id, content) =>
          setPrivateNotes((current) =>
            current.map((note) =>
              note.id === id ? { ...note, content } : note,
            ),
          )
        }
      />
    );
  },
};

export const PrivateNoteAdditionBeforeTimer: Story = {
  ...PrivateNoteAdditionDelayed,
  name: "1-1でタイマー未開始",
  args: {
    ...PrivateNoteAdditionDelayed.args,
    phase: STEP_1_1,
    timer: { status: "idle" },
  },
};

export const StepIntro: Story = {
  name: "ステップ開始の短い案内",
  args: {
    phase: buildPhaseStep(1, 2),
    notes: [],
    hmwDecidedIssue: "会議で発言する人が偏ってしまう",
  },
};

export const Phase1FirstStepIntro: Story = {
  name: "フェーズ1 Step 1の最初の一歩",
  args: {
    phase: buildPhaseStep(1, 1),
    notes: [],
  },
};

export const Phase1SecondStepIntro: Story = {
  name: "フェーズ1 Step 2の付箋共有",
  args: {
    phase: buildPhaseStep(2, 1),
  },
};

export const GuidePhase1Step1: Story = guideStory(1, 1);
export const GuidePhase1Step2: Story = guideStory(1, 2);
export const GuidePhase1Step3: Story = guideStory(1, 3);
export const GuidePhase1Step4: Story = guideStory(1, 4);
export const GuidePhase1Step5: Story = guideStory(1, 5);
export const GuidePhase2Step1: Story = guideStory(2, 1);
export const GuidePhase2Step2: Story = guideStory(2, 2);
export const GuidePhase2Step3: Story = guideStory(2, 3);
export const GuidePhase2Step4: Story = guideStory(2, 4);
export const GuidePhase3Step1: Story = guideStory(3, 1);
export const GuidePhase3Step2: Story = guideStory(3, 2);
export const GuidePhase3Step3: Story = guideStory(3, 3);
export const GuidePhase3Step4: Story = guideStory(3, 4);
export const GuidePhase3Step5: Story = guideStory(3, 5);

// 自分がドラッグ中の付箋がある状態（影が深くなり「持ち上げた」見た目になる）。
export const Dragging: Story = {
  args: {
    draggingNoteId: "note-1",
    interactions: {
      ...INTERACTIONS,
      isNoteDragging: true,
    },
  },
};

// 付箋がボード上に密集している状態（スクロールの確認用）。
export const ManyNotes: Story = {
  args: {
    notes: buildNotes(12),
  },
};

// 参加者が多い状態（メンバー一覧の +N 省略が発火する）。
export const ManyMembers: Story = {
  args: {
    members: buildMembers(10, ME),
  },
};

// 選定した Canvas HUD 案の基準状態。
// 10人・課題整理 Step 1・タイマー稼働中を同時に表示して幅と視線集中を確認する。
export const CanvasHud: Story = {
  args: {
    members: buildMembers(10, ME),
    notes: CANVAS_HUD_NOTES,
    phase: STEP_1_1,
    timer: {
      status: "running",
      endsAt: Date.now() + 138_000,
      durationMs: 180_000,
    },
  },
};

// 非ホストの状態（自分は ring のみ。ホストラベルは hostUserId のメンバーに付く）。
export const NonHost: Story = {
  args: {
    isHost: false,
    // 自分以外をホストにする（fixture の 2 人目）。
    hostUserId: buildMembers(3, ME).find((m) => m.userId !== ME)?.userId ?? ME,
  },
};

export const DotVoting: Story = {
  args: {
    phase: buildPhaseStep(4),
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: {
          count: index === 0 ? 1 : 0,
          votedByMe: index === 0,
          ownCount: index === 0 ? 1 : 0,
        },
        objective: {
          count: index + 1,
          votedByMe: index < 2,
          ownCount: index < 2 ? 1 : 0,
        },
      },
    })),
  },
};

// 投票中は受信者向け射影で count を持たず、本人の投票状態だけを表示する。
export const StealthVoting: Story = {
  args: {
    phase: STEP_1_4,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: {
          votedByMe: index === 0,
          ownCount: index === 0 ? 1 : 0,
        },
        objective: {
          votedByMe: index < 2,
          ownCount: index < 2 ? 1 : 0,
        },
      },
    })),
  },
};

export const VotingPending: Story = {
  args: {
    phase: STEP_1_4,
    notes: buildNotes(1).map((note) => ({
      ...note,
      dotVotes: {
        subjective: { votedByMe: true, ownCount: 1 },
        objective: { votedByMe: false, ownCount: 0 },
      },
    })),
    pendingVoteOperations: [{ noteId: "note-1", kind: "subjective" }],
  },
};

export const VotingFailure: Story = {
  args: {
    phase: STEP_1_4,
    voteFeedback: {
      state: "failed",
      message: "投票上限を超えています。",
    },
  },
};

export const VoteTotaled: Story = {
  args: {
    phase: STEP_1_5,
    members: buildMembers(2, ME),
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: {
          count: index === 0 ? 2 : 0,
          votedByMe: false,
          ownCount: 0,
        },
        objective: {
          count: index === 0 ? 1 : 5,
          votedByMe: false,
          ownCount: 0,
        },
      },
    })),
  },
};

export const VoteTotaledWithoutVotes: Story = {
  args: {
    phase: STEP_1_5,
    notes: buildNotes(3),
  },
};

export const VoteTotaledTie: Story = {
  args: {
    phase: STEP_1_5,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: { count: index < 2 ? 2 : 0, votedByMe: false, ownCount: 0 },
        objective: { count: index < 2 ? 3 : 1, votedByMe: false, ownCount: 0 },
      },
    })),
  },
};

export const VoteTotaledMany: Story = {
  args: {
    phase: STEP_1_5,
    notes: buildNotes(12).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: { count: index % 3, votedByMe: false, ownCount: 0 },
        objective: { count: index + 1, votedByMe: false, ownCount: 0 },
      },
    })),
  },
};

export const VotingAt1280x720: Story = {
  args: {
    phase: STEP_1_4,
    members: buildMembers(10, ME),
    notes: CANVAS_HUD_NOTES,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 1280, height: 720, overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
};

export const ReadyToDecide: Story = {
  args: {
    phase: STEP_1_5,
    isHost: true,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 120 + index * 280,
      y: 180,
    })),
  },
};

export const SelectingCandidate: Story = {
  args: {
    phase: STEP_1_5,
    isHost: true,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 120 + index * 280,
      y: 180,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "採用する付箋を選ぶ" }),
    );
    await userEvent.hover(
      canvas.getAllByRole("button", { name: /採用する付箋:/ })[0],
    );
  },
};

export const SelectingAt768px: Story = {
  args: {
    phase: STEP_1_5,
    isHost: true,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 80 + index * 210,
      y: 220,
    })),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 768, height: 720, overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "採用する付箋を選ぶ" }),
    );
    await userEvent.hover(
      canvas.getAllByRole("button", { name: /採用する付箋:/ })[0],
    );
  },
};

export const SelectingIdeaMapCandidate: Story = {
  args: {
    phase: buildPhaseStep(5, 3),
    isHost: true,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 20 + index * 30,
      y: 25 + index * 20,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "採用する付箋を選ぶ",
      }),
    );
    await userEvent.hover(
      canvas.getAllByRole("button", { name: /採用するアイデア:/ })[0],
    );
  },
};

export const Decided: Story = {
  args: {
    phase: STEP_1_5,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 120 + index * 280,
      y: 180,
    })),
    decision: buildDecision({
      noteId: "note-1",
      decidedBy: ME,
    }),
  },
};

export const FinalDecisionPending: Story = {
  args: {
    phase: STEP_3_5,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 120 + index * 280,
      y: 180,
    })),
    decision: buildDecision({ phase: 3, noteId: "note-1", decidedBy: ME }),
    hmwDecidedIssue: "決定した課題",
    decidedHmw: "決定した問い",
  },
};

export const OutcomePublished: Story = {
  args: {
    ...FinalDecisionPending.args,
    outcomePublished: true,
  },
};

// loading相当: WebSocket 接続の確立中（初回接続時。snapshot 未着なので付箋も空）。
export const Connecting: Story = {
  args: {
    notes: [],
    connectionStatus: "connecting",
  },
};

// error相当: 予期しない切断から自動再接続を待っている状態。
export const Reconnecting: Story = {
  args: {
    connectionStatus: "closed",
  },
};

// ホストがステップ移行操作を行える状態。
export const HostCanMovePhase: Story = {
  args: {
    isHost: true,
    phase: STEP_1_1,
  },
};

export const Step1_1_PersonalWriting: Story = {
  args: {
    phase: STEP_1_1,
    notes: [],
    interactions: {
      ...INTERACTIONS,
      privateNotes: buildNotes(2).map((note) => ({
        ...note,
        visibility: "private" as const,
      })),
    },
  },
  render: function Render(args) {
    const [privateNotes, setPrivateNotes] = useState(
      args.interactions.privateNotes,
    );
    return (
      <RoomBoardView
        {...args}
        interactions={{ ...args.interactions, privateNotes }}
        onPrivateNoteContentChange={(id, content) => {
          args.onPrivateNoteContentChange(id, content);
          setPrivateNotes((current) =>
            current.map((note) =>
              note.id === id ? { ...note, content } : note,
            ),
          );
        }}
        onPrivateNoteDelete={(id) => {
          args.onPrivateNoteDelete(id);
          setPrivateNotes((current) =>
            current.filter((note) => note.id !== id),
          );
        }}
      />
    );
  },
};

export const Step1_2_Sharing: Story = {
  args: {
    phase: STEP_1_2,
    notes: buildNotes(3),
    interactions: {
      ...INTERACTIONS,
      privateNotes: buildNotes(2).map((note) => ({
        ...note,
        visibility: "private" as const,
      })),
    },
  },
};

export const SharingWaitingForContentSave: Story = {
  args: { ...Step1_2_Sharing.args, isSavingBeforeShare: true },
};

export const Step1_3_Grouping: Story = {
  args: {
    phase: STEP_1_3,
    notes: buildNotes(5),
    groups: [],
  },
};

export const Step1_4_Voting: Story = {
  args: {
    phase: STEP_1_4,
    notes: buildNotes(5),
  },
};

export const Step1_5_Result: Story = {
  args: {
    phase: STEP_1_5,
    decision: null,
  },
};

// 「次のステップへ」押下後、確認ダイアログが表示されている状態。
export const NextPhaseConfirmDialog: Story = {
  args: {
    isHost: true,
    phase: STEP_1_1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole("button", {
        name: "次のステップへ",
      }),
    );
  },
};

// Step 2-1（問いの個人執筆）: 持ち越された決定課題バナー（上端）と問い
// テンプレートパネル（左端）がボード上に浮かび、ボード面は自分の付箋だけ
// （共有付箋・グループは出さない）。
export const HmwWritingStep: Story = {
  args: {
    phase: STEP_2_1,
    notes: [],
    hmwDecidedIssue: buildCarryover().content,
    issueReference: buildCarryover(),
    interactions: {
      ...INTERACTIONS,
      privateNotes: buildNotes(2).map((note) => ({
        ...note,
        visibility: "private" as const,
      })),
    },
  },
};

export const IdeaWritingWithCarryovers: Story = {
  args: {
    phase: buildPhaseStep(1, 3),
    issueReference: buildCarryover({
      color: "pink",
      fontSize: 18,
      dotVotes: { subjective: 5, objective: 2 },
    }),
    hmwReference: buildCarryover({
      phase: 2,
      color: "blue",
      fontSize: 16,
      dotVotes: { subjective: 3, objective: 4 },
    }),
    hmwDecidedIssue: buildCarryover({
      phase: 1,
      content: "ユーザーが作業を後回しにしてしまう",
    }).content,
    decidedHmw: buildCarryover({
      phase: 2,
      content: "どうすれば、楽しく最初の一歩を踏み出せるだろうか？",
    }).content,
  },
};

// 背景パン・付箋移動・ズームを同じカメラ上で確認する。
export const IdeaMapInteraction: Story = {
  args: {
    phase: buildPhaseStep(3, 3),
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: [1, 50, 99][index],
      y: [99, 50, 1][index],
    })),
  },
};

export const CanvasPanInteraction: Story = {
  args: {
    phase: STEP_1_2,
    notes: CANVAS_HUD_NOTES,
    timer: { status: "idle" },
  },
  render: function Render(args) {
    const boardScrollerRef = useRef<HTMLDivElement>(null);
    const camera = useCanvasCamera({
      viewportRef: boardScrollerRef,
      notes: args.notes,
    });
    const help = useBoardHelp(args.phase);
    return (
      <RoomBoardView
        {...args}
        help={help}
        interactions={{
          ...args.interactions,
          notes: args.notes,
          boardScrollerRef,
          camera: camera.camera,
          displayZoom: camera.displayZoom,
          onSelectionChange: camera.setSelectedNoteIds,
          gridStyle: camera.gridStyle,
          isPanning: camera.isPanning,
          onToolChange: camera.setInteractionTool,
          onGestureBlockedChange: camera.setGestureBlocked,
          hasPan: camera.hasPan,
          cancelPan: camera.cancelPan,
          consumePanClick: camera.consumePanClick,
          onCanvasPointerDown: camera.handlePointerDown,
          onCanvasPointerMove: camera.handlePointerMove,
          onCanvasPointerEnd: camera.handlePointerEnd,
          onZoomIn: camera.zoomIn,
          onZoomOut: camera.zoomOut,
          onResetZoom: camera.resetZoom,
          onFitToNotes: camera.fitToNotes,
        }}
      />
    );
  },
};

export const VotingGuideScrollInteraction: Story = {
  ...CanvasPanInteraction,
  args: {
    phase: STEP_1_4,
    notes: CANVAS_HUD_NOTES,
  },
};

export const WithFeedback: Story = {
  render: function Render(args) {
    const feedback = useFeedback(
      "board-feedback-story",
      async (_room, input) => ({ ok: true, id: input.id }),
    );
    return <RoomBoardView {...args} feedback={feedback} />;
  },
};

// サーバー応答後に決定が解除された状態を再現し、取消から再採用まで操作できる。
const decisionReselectionRender: Story["render"] =
  function DecisionReselectionRender(args) {
    const [decision, setDecision] = useState<Decision | null>(args.decision);
    const help = useBoardHelp(args.phase);
    return (
      <RoomBoardView
        {...args}
        help={help}
        interactions={{ ...args.interactions, notes: args.notes }}
        decision={decision}
        onDecisionClear={() => {
          args.onDecisionClear?.();
          setDecision(null);
        }}
        onNoteDecide={(noteId) => {
          args.onNoteDecide(noteId);
          setDecision(
            buildDecision({
              noteId,
              phase: args.phase.kind === "step" ? args.phase.phase : 1,
              decidedBy: ME,
            }),
          );
        }}
      />
    );
  };
export const DecisionReselection: Story = {
  render: decisionReselectionRender,
  args: { ...Decided.args, isHost: true },
};
export const HmwDecisionReselection: Story = {
  render: decisionReselectionRender,
  args: {
    ...DecisionReselection.args,
    phase: buildPhaseStep(4, 2),
    decision: buildDecision({ phase: 2, noteId: "note-1", decidedBy: ME }),
    hmwDecidedIssue: GUIDE_ISSUE,
  },
};
export const IdeaDecisionReselection: Story = {
  render: decisionReselectionRender,
  args: {
    ...FinalDecisionPending.args,
    isHost: true,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 20 + index * 30,
      y: 25 + index * 20,
    })),
  },
};

export const FitUnavailable: Story = {
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster position="bottom-center" />
      </>
    ),
  ],
  args: {
    phase: STEP_1_4,
    interactions: { ...INTERACTIONS, onFitToNotes: fn(() => false) },
  },
};

export const ExcludedVoteAttempt: Story = {
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster position="bottom-center" />
      </>
    ),
  ],
  name: "再投票で候補外に投票したとき",
  args: {
    phase: STEP_1_4,
    notes: buildNotes(2).map((note, index) => ({
      ...note,
      excluded: index === 0,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "主観シール 残り1票" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /^候補外の付箋$/ }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const notice = await body.findByText(
      "候補外の付箋には投票できません。残りの票は減っていません。候補の付箋にシールを貼ってください。",
      { exact: true },
    );
    await waitFor(() => expect(notice).toBeVisible());
    await expect(
      canvas.getByRole("button", { name: "主観シール 残り1票" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "客観シール 残り3票" }),
    ).toBeVisible();
  },
};

export const CanvasInputInteraction: Story = {
  args: {
    phase: STEP_1_3,
    notes: CANVAS_HUD_NOTES.slice(0, 3),
  },
  render: function Render(args) {
    const [notes, setNotes] = useState(args.notes);
    const [ideaMapSizeLevel, setIdeaMapSizeLevel] = useState(
      args.ideaMapSizeLevel ?? 0,
    );
    const [adoptionCount, setAdoptionCount] = useState(0);
    const [privateNotes, setPrivateNotes] = useState(
      args.interactions.privateNotes,
    );
    const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
    const interactions = useRoomBoardInteractions({
      notes,
      privateNotes,
      currentUserId: args.currentUserId,
      draggingNoteId,
      phase: args.phase,
      isDecided: args.decision !== null,
      sharing: args.sharing,
      ideaMapSizeLevel,
      ideaMapSizeInitialized: args.ideaMapSizeInitialized,
      getFitInsets: getBoardFitInsets,
      onNoteDragStart: (id) => setDraggingNoteId(id),
      onNoteDragMove: (id, x, y) => {
        setNotes((current) =>
          current.map((note) => (note.id === id ? { ...note, x, y } : note)),
        );
      },
      onNoteDragEnd: (id, x, y) => {
        setNotes((current) =>
          current.map((note) =>
            note.id === id
              ? {
                  ...note,
                  x,
                  y,
                }
              : note,
          ),
        );
        setDraggingNoteId(null);
      },
      onNoteDragCancel: () => setDraggingNoteId(null),
      onPrivateNotePublish: (id, x, y) => {
        const note = privateNotes.find((item) => item.id === id);
        if (!note) return;
        setPrivateNotes((current) => current.filter((item) => item.id !== id));
        setNotes((current) => [
          ...current,
          { ...note, visibility: "shared", x, y },
        ]);
      },
      onPrivateNoteUnpublish: (id) => {
        const note = notes.find((item) => item.id === id);
        if (!note) return;
        setNotes((current) => current.filter((item) => item.id !== id));
        setPrivateNotes((current) => [
          ...current,
          { ...note, visibility: "private" },
        ]);
      },
      onCursorMove: () => undefined,
      onCursorLeave: () => undefined,
    });
    const help = useBoardHelp(args.phase);
    return (
      <>
        <RoomBoardView
          {...args}
          ideaMapSizeLevel={ideaMapSizeLevel}
          onIdeaMapResize={setIdeaMapSizeLevel}
          notes={notes}
          interactions={interactions}
          help={help}
          draggingNoteId={draggingNoteId}
          onNoteDecide={(noteId) => {
            args.onNoteDecide(noteId);
            setAdoptionCount((count) => count + 1);
          }}
          onNoteVote={(noteId, kind, x, y) => {
            args.onNoteVote(noteId, kind, x, y);
            const id = crypto.randomUUID();
            setNotes((current) =>
              current.map((note) => {
                if (note.id !== noteId) return note;
                const votes = note.dotVotes[kind];
                return {
                  ...note,
                  dotVoteStickers: [
                    ...note.dotVoteStickers,
                    { id, kind, x, y },
                  ],
                  dotVotes: {
                    ...note.dotVotes,
                    [kind]: {
                      ...votes,
                      count: (votes.count ?? 0) + 1,
                      ownCount: votes.ownCount + 1,
                      votedByMe: true,
                    },
                  },
                };
              }),
            );
          }}
          onNoteVoteStickerMove={(id, noteId, x, y) => {
            args.onNoteVoteStickerMove(id, noteId, x, y);
            setNotes((current) => {
              const sticker = current
                .flatMap((note) => note.dotVoteStickers)
                .find((item) => item.id === id);
              if (!sticker) return current;
              return current.map((note) => {
                const hadSticker = note.dotVoteStickers.some(
                  (item) => item.id === id,
                );
                const receivesSticker = note.id === noteId;
                if (!hadSticker && !receivesSticker) return note;
                const delta = Number(receivesSticker) - Number(hadSticker);
                const votes = note.dotVotes[sticker.kind];
                const ownCount = votes.ownCount + delta;
                return {
                  ...note,
                  dotVoteStickers: [
                    ...note.dotVoteStickers.filter((item) => item.id !== id),
                    ...(receivesSticker ? [{ ...sticker, x, y }] : []),
                  ],
                  dotVotes: {
                    ...note.dotVotes,
                    [sticker.kind]: {
                      ...votes,
                      count: (votes.count ?? 0) + delta,
                      ownCount,
                      votedByMe: ownCount > 0,
                    },
                  },
                };
              });
            });
          }}
          onNoteVoteStickerRemove={(id) => {
            args.onNoteVoteStickerRemove(id);
            setNotes((current) =>
              current.map((note) => {
                const removed = note.dotVoteStickers.find(
                  (sticker) => sticker.id === id,
                );
                if (!removed) return note;
                const votes = note.dotVotes[removed.kind];
                const ownCount = Math.max(0, votes.ownCount - 1);
                return {
                  ...note,
                  dotVoteStickers: note.dotVoteStickers.filter(
                    (sticker) => sticker.id !== id,
                  ),
                  dotVotes: {
                    ...note.dotVotes,
                    [removed.kind]: {
                      ...votes,
                      count: Math.max(0, (votes.count ?? 0) - 1),
                      ownCount,
                      votedByMe: ownCount > 0,
                    },
                  },
                };
              }),
            );
          }}
          onNoteContentChange={(id, content) =>
            setNotes((current) =>
              current.map((note) =>
                note.id === id ? { ...note, content } : note,
              ),
            )
          }
          onNoteFontSizeChange={(id, fontSize) =>
            setNotes((current) =>
              current.map((note) =>
                note.id === id ? { ...note, fontSize } : note,
              ),
            )
          }
          onNoteBringToFront={(id) =>
            setNotes((current) =>
              current.map((note) =>
                note.id === id
                  ? {
                      ...note,
                      stackOrder:
                        Math.max(...current.map((item) => item.stackOrder)) + 1,
                    }
                  : note,
              ),
            )
          }
        />
        <output hidden data-testid="canvas-input-adoption-count">
          {adoptionCount}
        </output>
      </>
    );
  },
};

export const IdeaMapWorkspace: Story = {
  ...CanvasInputInteraction,
  name: "3-2 共有 / 2軸マップとマイ付箋",
  args: {
    phase: buildPhaseStep(2, 3),
    sharing: buildSharingState({ status: "active", currentIndex: 0 }),
    moveHistory: {
      undo: { label: "戻せる移動はありません", reason: null, disabled: true },
      redo: {
        label: "やり直せる移動はありません",
        reason: null,
        disabled: true,
      },
      pending: false,
      onUndo: fn(),
      onRedo: fn(),
    },
    decidedHmw: GUIDE_QUESTION,
    hmwDecidedIssue: GUIDE_ISSUE,
    issueReference: buildCarryover({ phase: 1, content: GUIDE_ISSUE }),
    hmwReference: buildCarryover({ phase: 2, content: GUIDE_QUESTION }),
    notes: [
      buildNote({
        id: "map-workspace-placed",
        authorId: ME,
        content: "最初の一歩を小さくする",
        x: 70,
        y: 75,
      }),
      ...buildNotes(8).map((note, index) => ({
        ...note,
        id: `map-workspace-shared-${index + 1}`,
        authorId: ME,
        content: CANVAS_HUD_CONTENTS[index % CANVAS_HUD_CONTENTS.length],
        x: 10 + ((index * 29) % 80),
        y: 12 + ((index * 37) % 76),
      })),
    ],
    interactions: {
      ...INTERACTIONS,
      privateNotes: buildNotes(12).map((note, index) => ({
        ...note,
        id: `map-workspace-private-${index + 1}`,
        authorId: ME,
        visibility: "private" as const,
        content: CANVAS_HUD_CONTENTS[index % CANVAS_HUD_CONTENTS.length],
      })),
    },
    isHost: true,
    ideaMapSizeLevel: 4,
    ideaMapSizeInitialized: true,
  },
};

export const IdeaMapOnly: Story = {
  ...IdeaMapWorkspace,
  name: "3-3 評価 / マップのみ",
  args: {
    ...IdeaMapWorkspace.args,
    phase: buildPhaseStep(3, 3),
    sharing: null,
    interactions: { ...INTERACTIONS, privateNotes: [] },
  },
};

export const IdeaMapPhaseTransitions: Story = {
  ...IdeaMapWorkspace,
  name: "2軸マップ / 再読み込みしない工程切り替え",
  render: function Render(args) {
    const [step, setStep] = useState(1);
    const [timer, setTimer] = useState(args.timer);
    const phase = buildPhaseStep(step, 3);
    const help = useBoardHelp(phase);
    return (
      <>
        <RoomBoardView
          {...args}
          phase={phase}
          help={help}
          timer={timer}
          onTimerPause={() => {
            if (timer.status !== "running") return;
            setTimer({
              status: "paused",
              remainingMs: Math.max(0, timer.endsAt - Date.now()),
              durationMs: timer.durationMs,
            });
          }}
          onTimerResume={() => {
            if (timer.status !== "paused") return;
            setTimer({
              status: "running",
              endsAt: Date.now() + timer.remainingMs,
              durationMs: timer.durationMs,
            });
          }}
          interactions={{ ...args.interactions, notes: args.notes }}
        />
        <select
          aria-label="検証用の工程切り替え"
          className="fixed right-3 bottom-24 z-50 border bg-background"
          value={step}
          onChange={(event) => setStep(Number(event.target.value))}
        >
          <option value={1}>3-1 個人</option>
          <option value={2}>3-2 共有</option>
          <option value={3}>3-3 評価</option>
          <option value={4}>3-4 投票</option>
          <option value={5}>3-5 決定</option>
        </select>
      </>
    );
  },
};

export const IdeaMapVoting: Story = {
  ...IdeaMapOnly,
  name: "3-4 投票 / 評価と同じマップ",
  args: { ...IdeaMapOnly.args, phase: buildPhaseStep(4, 3) },
};

export const IdeaMapResult: Story = {
  ...IdeaMapOnly,
  name: "3-5 決定 / 評価と同じマップ",
  args: {
    ...IdeaMapOnly.args,
    phase: buildPhaseStep(5, 3),
    notes: IdeaMapOnly.args?.notes?.map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: { count: index % 2, ownCount: 0, votedByMe: false },
        objective: { count: index + 1, ownCount: 0, votedByMe: false },
      },
    })),
  },
};

export const IdeaMapSharingEdges: Story = {
  ...IdeaMapWorkspace,
  name: "2軸マップ / 共有付箋を四隅へ移動",
  args: {
    ...IdeaMapWorkspace.args,
    notes: [
      buildNote({
        id: "map-edge-movable",
        authorId: ME,
        content: "マップの端まで動かす付箋",
        x: 50,
        y: 60,
      }),
    ],
  },
};

export const IdeaMapEvaluationEdges: Story = {
  ...IdeaMapSharingEdges,
  name: "2軸マップ / 評価中の付箋を四隅へ移動",
  args: {
    ...IdeaMapSharingEdges.args,
    phase: buildPhaseStep(3, 3),
    sharing: null,
    interactions: { ...INTERACTIONS, privateNotes: [] },
  },
};

export const IdeaMapDecisionEdges: Story = {
  ...IdeaMapEvaluationEdges,
  name: "2軸マップ / 決定前の付箋を四隅へ移動",
  args: { ...IdeaMapEvaluationEdges.args, phase: buildPhaseStep(5, 3) },
};

export const IdeaMapVotingEdges: Story = {
  ...IdeaMapEvaluationEdges,
  name: "2軸マップ / 四隅に配置済みの投票候補",
  args: {
    ...IdeaMapEvaluationEdges.args,
    phase: buildPhaseStep(4, 3),
    notes: [
      [0, 0],
      [0, 100],
      [100, 0],
      [100, 100],
    ].map(([x, y], index) =>
      buildNote({
        id: `map-edge-${index}`,
        content: `投票候補 ${index + 1}`,
        x,
        y,
      }),
    ),
  },
};

export const CanvasInputSharing: Story = {
  ...CanvasInputInteraction,
  args: {
    ...CanvasInputInteraction.args,
    phase: STEP_1_2,
    sharing: buildSharingState({ status: "active", currentIndex: 0 }),
  },
};

export const CanvasInputPrivate: Story = {
  ...CanvasInputSharing,
  args: {
    ...CanvasInputSharing.args,
    interactions: {
      ...INTERACTIONS,
      privateNotes: [
        buildNote({
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          authorId: ME,
          visibility: "private",
          content: "取消確認用のマイ付箋",
        }),
      ],
    },
  },
};

export const CanvasInputVoting: Story = {
  ...CanvasInputInteraction,
  args: {
    ...CanvasInputInteraction.args,
    phase: STEP_1_4,
    notes: CANVAS_HUD_NOTES.slice(0, 3).map((note, index) =>
      index === 0
        ? {
            ...note,
            dotVoteStickers: [
              {
                id: "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa",
                kind: "objective",
                x: 0.2,
                y: 0.3,
              },
            ],
            dotVotes: {
              subjective: { count: 0, ownCount: 0, votedByMe: false },
              objective: { count: 1, ownCount: 1, votedByMe: true },
            },
          }
        : note,
    ),
  },
};

export const CanvasInputQuestionVoting: Story = {
  ...CanvasInputVoting,
  args: {
    ...CanvasInputVoting.args,
    phase: buildPhaseStep(3, 2),
    isHost: false,
    hmwDecidedIssue: GUIDE_ISSUE,
    notes: CANVAS_HUD_NOTES.slice(0, 3).map((note, index) => ({
      ...note,
      x: index < 2 ? 180 + index * 48 : 580,
      y: index < 2 ? 180 + index * 32 : 320,
      dotVoteStickers:
        index === 1
          ? [
              {
                id: "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa",
                kind: "objective",
                x: 0.2,
                y: 0.3,
              },
            ]
          : [],
      dotVotes: {
        subjective: { ownCount: 0, votedByMe: false },
        objective: { ownCount: index === 1 ? 1 : 0, votedByMe: index === 1 },
      },
    })),
  },
};

export const QuestionVotingStickerSelected: Story = {
  ...CanvasInputQuestionVoting,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "客観シール 残り2票" }),
    );
    await expect(
      within(canvasElement).getByRole("img", { name: "付箋の移動：不可" }),
    ).toBeVisible();
  },
};

export const CanvasInputAdoption: Story = {
  ...CanvasInputInteraction,
  args: { ...CanvasInputInteraction.args, phase: STEP_1_5, isHost: true },
};

export const MoveHistoryAvailable: Story = {
  args: {
    moveHistory: {
      undo: {
        label: "2枚の付箋の移動（note-a, note-b）",
        reason: null,
        disabled: false,
      },
      redo: {
        label: "やり直せる移動はありません",
        reason: "やり直せる移動はありません",
        disabled: true,
      },
      pending: false,
      onUndo: fn(),
      onRedo: fn(),
    },
  },
};
export const MoveHistoryPending: Story = {
  args: {
    ...MoveHistoryAvailable.args,
    moveHistory: {
      undo: {
        label: "2枚の付箋の移動（note-a, note-b）",
        reason: null,
        disabled: false,
      },
      redo: {
        label: "やり直せる移動はありません",
        reason: "やり直せる移動はありません",
        disabled: true,
      },
      pending: true,
      onUndo: fn(),
      onRedo: fn(),
    },
  },
};

export const MoveHistorySharing: Story = {
  args: {
    ...Step1_2_Sharing.args,
    ...MoveHistoryPending.args,
    phase: STEP_1_2,
  },
};
export const MoveHistoryMap: Story = {
  args: { ...MoveHistoryAvailable.args, phase: buildPhaseStep(3, 3) },
};

export const ConnectedEmpty: Story = {
  args: { notes: [], connectionStatus: "open" },
};

// 採用済み・未採用・候補外を同じ画面で実際にドラッグできる。
export const DecidedMoveInteraction: Story = {
  render: CanvasInputInteraction.render,
  args: {
    ...Decided.args,
    notes: Decided.args?.notes?.map((note, index) => ({
      ...note,
      excluded: index === 2,
    })),
  },
};

export const HmwDecidedMoveInteraction: Story = {
  ...DecidedMoveInteraction,
  args: {
    ...DecidedMoveInteraction.args,
    phase: buildPhaseStep(4, 2),
    decision: buildDecision({ phase: 2, noteId: "note-1", decidedBy: ME }),
    hmwDecidedIssue: GUIDE_ISSUE,
  },
};

export const IdeaDecidedMoveInteraction: Story = {
  ...DecidedMoveInteraction,
  args: {
    ...FinalDecisionPending.args,
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      x: 20 + index * 30,
      y: 25 + index * 20,
      excluded: index === 2,
    })),
  },
};
