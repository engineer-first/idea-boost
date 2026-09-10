import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildCarryover,
  buildDecision,
  buildMembers,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import { RoomBoardView } from "./room-board-view";

const ME = "11111111-1111-4111-8111-111111111111";
const STEP_1_1 = buildPhaseStep(1);
const STEP_1_2 = buildPhaseStep(2);
const STEP_1_3 = buildPhaseStep(3);
const STEP_1_4 = buildPhaseStep(4);
const STEP_1_5 = buildPhaseStep(5);
const STEP_2_1 = buildPhaseStep(1, 2);
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
  onNoteDragStart: fn(),
  onPrivateNoteDragStart: fn(),
};

const meta = {
  title: "Room/RoomBoardView",
  component: RoomBoardView,
  render: (args) => (
    <RoomBoardView
      {...args}
      interactions={{ ...args.interactions, notes: args.notes }}
    />
  ),
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
    decision: null,
    connectionStatus: "open",
    draggingNoteId: null,
    members: buildMembers(3, ME),
    currentUserId: ME,
    hostUserId: ME,
    isNextPhasePending: false,
    signOutAction: fn(),
    interactions: INTERACTIONS,
    hmwDecidedIssue: null,
    decidedHmw: null,
    onAddPrivateNote: fn(),
    onHmwTemplateSelect: fn(),
    onIdeaHintSelect: fn(),
    onPrivateNoteContentChange: fn(),
    onPrivateNoteDelete: fn(),
    onNoteContentChange: fn(),
    onNoteDelete: fn(),
    onGroupCreate: fn(),
    onGroupUpdateName: fn(),
    groups: [],
    onNoteVote: fn(),
    onNoteVoteReset: fn(),
    onNoteDecide: fn(),
    onLeave: fn(),
    isLeaving: false,
    onNextPhase: fn(),
    onTimerStart: fn(),
    onTimerPause: fn(),
    onTimerResume: fn(),
    onTimerExtend: fn(),
    onTimerStop: fn(),
    remoteCursors: [],
    remoteNoteDrags: [],
    areCursorsVisible: true,
    onToggleCursors: fn(),
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

// success相当: 付箋が配置されている状態。
export const WithNotes: Story = {};

// empty相当: ルーム作成直後、まだ誰も付箋を置いていない状態。
export const Empty: Story = {
  args: {
    notes: [],
  },
};

// 自分がドラッグ中の付箋がある状態（影が深くなり「持ち上げた」見た目になる）。
export const Dragging: Story = {
  args: {
    draggingNoteId: "note-1",
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

export const ReadyToDecide: Story = {
  args: {
    phase: STEP_1_5,
    isHost: true,
  },
};

export const Decided: Story = {
  args: {
    phase: STEP_1_5,
    decision: buildDecision({
      noteId: "note-1",
      decidedBy: ME,
    }),
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

// Step 2-1（HMW 個人執筆）: 持ち越された決定課題バナー（上端）と HMW
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
