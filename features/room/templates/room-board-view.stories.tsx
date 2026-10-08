import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Toaster } from "@/components/ui/sonner";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { Decision } from "@/contracts/room-protocol";
import {
  buildCarryover,
  buildDecision,
  buildMembers,
  buildNote,
  buildNotes,
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
    timer: { status: "idle" },
    timerServerOffsetMs: 0,
    isHost: true,
    hostRevision: 0,
    onTransferHost: fn(),
    decision: null,
    outcomePublished: false,
    connectionStatus: "open",
    draggingNoteId: null,
    members: buildMembers(3, ME),
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
    initialGuideState: "compact",
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
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
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
      initialGuideState: "detail",
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

export const StepIntro: Story = {
  name: "ステップ開始の短い案内",
  args: {
    phase: buildPhaseStep(1, 2),
    notes: [],
    initialGuideState: "intro",
    hmwDecidedIssue: "会議で発言する人が偏ってしまう",
  },
};

export const Phase1FirstStepIntro: Story = {
  name: "フェーズ1 Step 1の最初の一歩",
  args: {
    phase: buildPhaseStep(1, 1),
    notes: [],
    initialGuideState: "intro",
  },
};

export const PhaseOneWritingDemo: Story = {
  name: "フェーズ1-1 自動デモ（デスクトップ）",
  args: {
    phase: buildPhaseStep(1, 1),
    notes: [],
    initialGuideState: "compact",
    interactions: {
      ...INTERACTIONS,
      privateNotes: [],
    },
    showPhaseOneWritingTour: true,
  },
};

export const Phase1SecondStepIntro: Story = {
  name: "フェーズ1 Step 2の付箋共有",
  args: {
    phase: buildPhaseStep(2, 1),
    initialGuideState: "intro",
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
  args: { phase: STEP_1_2, notes: CANVAS_HUD_NOTES },
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
    initialGuideState: "detail",
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
  args: { ...Decided.args, isHost: true, initialGuideState: "compact" },
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
    initialGuideState: "compact",
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
    initialGuideState: "detail",
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
    initialGuideState: "compact",
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
    initialGuideState: "compact",
  },
  render: function Render(args) {
    const [notes, setNotes] = useState(args.notes);
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
      ideaMapSizeLevel: args.ideaMapSizeLevel,
      ideaMapSizeInitialized: args.ideaMapSizeInitialized,
      getFitInsets: getBoardFitInsets,
      onNoteDragStart: (id) => setDraggingNoteId(id),
      onNoteDragMove: () => undefined,
      onNoteDragEnd: (id, x, y) => {
        setNotes((current) =>
          current.map((note) => (note.id === id ? { ...note, x, y } : note)),
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

export const CanvasInputSharing: Story = {
  ...CanvasInputInteraction,
  args: { ...CanvasInputInteraction.args, phase: STEP_1_2 },
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
