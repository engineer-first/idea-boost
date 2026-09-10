import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createRef } from "react";
import { fn } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildCarryover,
  buildDecision,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { getBoardPermissions } from "../logic/board-permissions";
import type { RenderedRemoteCursorPresence } from "../logic/cursor-presence";
import { RoomBoardCanvas } from "./room-board-canvas";

const STEP_1_1 = buildPhaseStep(1);
const STEP_1_2 = buildPhaseStep(2);
const STEP_1_3 = buildPhaseStep(3);
const STEP_1_4 = buildPhaseStep(4);
const STEP_1_5 = buildPhaseStep(5);
const STEP_3_2 = buildPhaseStep(2, 3);
const REMOTE_CURSORS: RenderedRemoteCursorPresence[] = [
  {
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Taro Yamada",
    color: "green",
    x: 120,
    y: 180,
    draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    lastSeenAt: Date.now(),
    isIdle: false,
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    name: "A Participant With An Extremely Long Display Name",
    color: "zinc",
    x: 120,
    y: 180,
    draggingNoteId: null,
    lastSeenAt: Date.now() - 10_000,
    isIdle: true,
  },
  ...(["blue", "pink", "orange", "purple"] as const).map((color, index) => ({
    userId: `${index + 4}${"0".repeat(7)}-0000-4000-8000-000000000000`,
    name: `Member ${index + 4}`,
    color,
    x: 300 + index * 140,
    y: 120 + index * 80,
    draggingNoteId: null,
    lastSeenAt: Date.now(),
    isIdle: false,
  })),
];

const meta = {
  title: "Room/RoomBoardCanvas",
  component: RoomBoardCanvas,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    notes: buildNotes(3),
    groups: [],
    phase: STEP_1_1,
    decision: null,
    permissions: getBoardPermissions(STEP_1_1),
    isHost: true,
    privateNotes: [],
    selectedNoteId: null,
    draggingNoteId: null,
    isDisconnected: false,
    voteRemaining: { subjective: 5, objective: 10 },
    dragGhost: null,
    isReturnDropTarget: false,
    hmwDecidedIssue: null,
    decidedHmw: null,
    boardScrollerRef: createRef<HTMLDivElement>(),
    ideaMapPlaneRef: createRef<HTMLDivElement>(),
    privateToolbarRef: createRef<HTMLDivElement>(),
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: {},
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
    onSelect: fn(),
    onHmwTemplateSelect: fn(),
    onIdeaHintSelect: fn(),
    onNoteDragStart: fn(),
    onNoteContentChange: fn(),
    onNoteDelete: fn(),
    onNoteVote: fn(),
    onNoteVoteReset: fn(),
    onNoteDecide: fn(),
    onGroupCreate: fn(),
    onGroupUpdateName: fn(),
    onAddPrivateNote: fn(),
    onPrivateNoteContentChange: fn(),
    onPrivateNoteDelete: fn(),
    onPrivateNoteDragStart: fn(),
    remoteCursors: [],
    remoteNoteDrags: [],
    areCursorsVisible: true,
    onToggleCursors: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "80vh", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomBoardCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

// success相当: 付箋が配置されている状態。
export const WithNotes: Story = {};

// empty相当: まだ誰も付箋を置いていない状態。
export const Empty: Story = {
  args: {
    notes: [],
  },
};

// 近接する付箋がグループ枠にまとまっている状態。
export const Grouped: Story = {
  args: {
    phase: STEP_1_3,
    permissions: getBoardPermissions(STEP_1_3),
    notes: [
      buildNote({ id: "note-1", x: 100, y: 100 }),
      buildNote({ id: "note-2", x: 350, y: 100 }),
    ],
    groups: [{ id: "g1", name: "課題グループ", noteIds: ["note-1", "note-2"] }],
  },
};

// Step 1-2 では永続グループが存在しても枠を表示しない。
export const GroupsHiddenBeforeGrouping: Story = {
  args: {
    phase: STEP_1_2,
    notes: [
      buildNote({ id: "note-1", x: 100, y: 100 }),
      buildNote({ id: "note-2", x: 350, y: 100 }),
    ],
    groups: [{ id: "g1", name: "課題グループ", noteIds: ["note-1", "note-2"] }],
  },
};

// ツールバー発ドラッグの途中（ゴースト付箋が持ち上がって見える）。
export const DraggingGhost: Story = {
  args: {
    dragGhost: {
      note: buildNote({ id: "ghost", content: "運んでいる付箋" }),
      x: 240,
      y: 160,
    },
  },
};

// マイ付箋ドックに付箋が並んでいる状態。
export const WithPrivateNotes: Story = {
  args: {
    privateNotes: buildNotes(2).map((note) => ({
      ...note,
      visibility: "private" as const,
    })),
  },
};

// error相当: 未接続中は付箋の操作が無効化される。
export const Disconnected: Story = {
  args: {
    isDisconnected: true,
    remoteCursors: [],
    remoteNoteDrags: [],
  },
};

// 多人数・同位置・長い名前・淡色・idle をまとめて視覚確認する。
export const ManyRemoteCursors: Story = {
  args: {
    phase: STEP_1_2,
    permissions: getBoardPermissions(STEP_1_2),
    remoteCursors: REMOTE_CURSORS,
  },
};

// 付箋は作者色（黄色）のまま、移動者（緑）の枠と名前を固定表示する。
export const NoteDraggedByAnotherMember: Story = {
  args: {
    phase: STEP_1_2,
    permissions: getBoardPermissions(STEP_1_2),
    notes: [buildNote({ id: "note-1", color: "yellow" })],
    remoteNoteDrags: [
      {
        noteId: "note-1",
        draggedBy: {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro Yamada",
          color: "green",
        },
        lastSeenAt: Date.now(),
      },
    ],
  },
};

export const ReadyToDecide: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    selectedNoteId: "note-1",
  },
};

export const Decided: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    decision: buildDecision({
      noteId: "note-1",
      decidedBy: "11111111-1111-4111-8111-111111111111",
    }),
  },
};

// Step 2-1: 決定課題バナー（上端中央）と HMW テンプレートパネル（左端）が
// ボード上に浮かぶ。オーバーレイの位置決めはこのコンポーネントの責務。
export const HmwWritingStep: Story = {
  args: {
    phase: buildPhaseStep(2, 1),
    permissions: getBoardPermissions(buildPhaseStep(2, 1)),
    notes: [],
    hmwDecidedIssue: buildCarryover().content,
  },
};

// 長文の決定課題は max-w-xl 内で折り返して全文表示し、左端パネルの帯を侵食しない。
export const HmwWritingStepLongIssue: Story = {
  args: {
    phase: buildPhaseStep(2, 1),
    permissions: getBoardPermissions(buildPhaseStep(2, 1)),
    notes: [],
    hmwDecidedIssue: buildCarryover({
      content:
        "宿題や家事や仕事のタスクが積み重なって優先順位を決められない。".repeat(
          3,
        ),
    }).content,
  },
};

// Step 2-2 以降相当: テンプレートパネルは消えても決定課題の掲示だけは残る。
export const HmwCarryoverOnly: Story = {
  args: {
    phase: buildPhaseStep(2, 2),
    permissions: getBoardPermissions(buildPhaseStep(2, 2)),
    hmwDecidedIssue: buildCarryover().content,
  },
};

export const IdeaWritingCarryovers: Story = {
  args: {
    phase: buildPhaseStep(1, 3),
    permissions: getBoardPermissions(buildPhaseStep(1, 3)),
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

// Step1-1: 個人で付箋を書く
export const Step1Writing: Story = {
  args: {
    phase: STEP_1_1,
    permissions: getBoardPermissions(STEP_1_1),
  },
};

// Step1-2: 共有・移動
export const Step1Sharing: Story = {
  args: {
    phase: STEP_1_2,
    permissions: getBoardPermissions(STEP_1_2),
  },
};

// Step1-3: グループ化
export const Step1Grouping: Story = {
  args: {
    phase: STEP_1_3,
    permissions: getBoardPermissions(STEP_1_3),
    groups: [
      {
        id: "g1",
        name: "課題グループ",
        noteIds: ["note-1", "note-2"],
      },
    ],
  },
};

// Step1-4: 投票
export const Step1Voting: Story = {
  args: {
    phase: STEP_1_4,
    permissions: getBoardPermissions(STEP_1_4),
  },
};

// Step1-5: 結果確認
export const Step1Result: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    selectedNoteId: "note-1",
  },
};

// Step3-2: 共有する段階から表示する連続的な2軸マップを確認する状態。
export const Step3IdeaMap: Story = {
  args: {
    phase: STEP_3_2,
    permissions: getBoardPermissions(STEP_3_2),
    notes: [],
  },
};

const fixedSizeMapArgs = {
  phase: buildPhaseStep(3, 3),
  permissions: getBoardPermissions(buildPhaseStep(3, 3)),
  notes: [
    buildNote({ id: "map-left", content: "アイデア A", x: 25, y: 25 }),
    buildNote({ id: "map-right", content: "アイデア B", x: 75, y: 75 }),
  ],
};

export const IdeaMapZoom50: Story = {
  args: {
    ...fixedSizeMapArgs,
    camera: { x: 0, y: 0, zoom: 0.5 },
  },
};

export const IdeaMapZoom200: Story = {
  args: {
    ...fixedSizeMapArgs,
    camera: { x: -400, y: -300, zoom: 2 },
  },
};
