import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ComponentProps, createRef, useState } from "react";
import { expect, fireEvent, fn, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
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
    selectedVoteKind: null,
    pendingVoteOperations: [],
    dragGhost: null,
    isReturnDropTarget: false,
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
    onNoteDragStart: fn(),
    onNoteContentChange: fn(),
    onNoteDelete: fn(),
    onNoteExclude: fn(),
    onNoteRestore: fn(),
    onNoteVote: fn(),
    onNoteVoteRemove: fn(),
    onNoteVoteStickerRemove: fn(),
    onNoteVoteStickerDragStart: fn(),
    isAdoptMode: false,
    adoptionFocusNoteId: null,
    onAdoptionFocusChange: fn(),
    onAdoptNote: fn(),
    onGroupCreate: fn(),
    onGroupUpdateName: fn(),
    onAddPrivateNote: fn(),
    onPrivateNoteContentChange: fn(),
    onPrivateNoteDelete: fn(),
    onPrivateNoteDragStart: fn(),
    remoteCursors: [],
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", height: "80vh", padding: 16 }}>
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

export const ReadyToDecide: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    isAdoptMode: true,
  },
};

export const ExcludedCandidate: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    notes: [
      buildNote({
        id: "note-1",
        content: "候補外でも同じ場所に残る",
        excluded: true,
      }),
      buildNote({ id: "note-2", content: "残っている候補", x: 360 }),
    ],
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = canvas.getAllByTestId("note-card");
    const excluded = cards.find((card) => card.dataset.noteId === "note-1");
    const active = cards.find((card) => card.dataset.noteId === "note-2");
    if (!excluded || !active) throw new Error("候補付箋が描画されていません");

    const excludedStyle = getComputedStyle(excluded);
    await expect(excludedStyle.boxShadow).toBe("none");
    await expect(excludedStyle.borderTopWidth).toBe("1px");
    await expect(excludedStyle.zIndex).toBe("0");
    await expect(getComputedStyle(active).zIndex).toBe("10");
    const excludedText = within(excluded).getByRole("textbox");
    await expect(
      Number.parseFloat(getComputedStyle(excludedText).paddingTop),
    ).toBeGreaterThanOrEqual(40);

    const activeSurface = within(active).getByRole("button", { name: "付箋" });
    fireEvent.contextMenu(activeSurface);
    await expect(args.onNoteExclude).not.toHaveBeenCalled();
    await expect(
      within(active).getByRole("menuitem", { name: "候補から外す" }),
    ).toBeVisible();
  },
};

export const NoCandidates: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    notes: buildNotes(2).map((note) => ({ ...note, excluded: true })),
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

function TwoClientAdoptionFocusPreview({
  args,
}: {
  args: ComponentProps<typeof RoomBoardCanvas>;
}) {
  const [adoptionFocusNoteId, setAdoptionFocusNoteId] = useState<string | null>(
    null,
  );
  const client = (isHost: boolean) => (
    <RoomBoardCanvas
      {...args}
      isHost={isHost}
      isAdoptMode={isHost}
      adoptionFocusNoteId={adoptionFocusNoteId}
      onAdoptionFocusChange={setAdoptionFocusNoteId}
      boardScrollerRef={createRef<HTMLDivElement>()}
      ideaMapPlaneRef={createRef<HTMLDivElement>()}
      privateToolbarRef={createRef<HTMLDivElement>()}
    />
  );

  return (
    <div className="grid h-[70vh] w-full grid-cols-2 gap-4">
      <section
        aria-label="ホストクライアント"
        className="flex min-h-0 flex-col"
      >
        <h2 className="mb-2 text-sm font-bold">ホスト</h2>
        {client(true)}
      </section>
      <section
        aria-label="参加者クライアント"
        className="flex min-h-0 flex-col"
      >
        <h2 className="mb-2 text-sm font-bold">参加者</h2>
        {client(false)}
      </section>
    </div>
  );
}

export const TwoClientSharedAdoptionFocus: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    notes: [buildNote({ id: "note-1", content: "共有中の候補", x: 40, y: 80 })],
  },
  render: (args) => <TwoClientAdoptionFocusPreview args={args} />,
};

function TwoClientAdoptionReselectionPreview({
  args,
}: {
  args: ComponentProps<typeof RoomBoardCanvas>;
}) {
  const [isAdoptMode, setIsAdoptMode] = useState(true);
  const [adoptionFocusNoteId, setAdoptionFocusNoteId] = useState<string | null>(
    null,
  );
  const client = (isHost: boolean) => (
    <RoomBoardCanvas
      {...args}
      isHost={isHost}
      isAdoptMode={isHost && isAdoptMode}
      adoptionFocusNoteId={adoptionFocusNoteId}
      onAdoptionFocusChange={setAdoptionFocusNoteId}
      onAdoptNote={() => {
        setAdoptionFocusNoteId(null);
        setIsAdoptMode(false);
      }}
      boardScrollerRef={createRef<HTMLDivElement>()}
      ideaMapPlaneRef={createRef<HTMLDivElement>()}
      privateToolbarRef={createRef<HTMLDivElement>()}
    />
  );

  return (
    <div className="flex h-[70vh] w-full flex-col gap-3">
      {!isAdoptMode ? (
        <button
          type="button"
          className="self-start rounded border px-3 py-2 text-sm"
          onClick={() => setIsAdoptMode(true)}
        >
          確定を取り消して選び直す
        </button>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <section
          aria-label="ホストクライアント"
          className="flex min-h-0 flex-col"
        >
          <h2 className="mb-2 text-sm font-bold">ホスト</h2>
          {client(true)}
        </section>
        <section
          aria-label="参加者クライアント"
          className="flex min-h-0 flex-col"
        >
          <h2 className="mb-2 text-sm font-bold">参加者</h2>
          {client(false)}
        </section>
      </div>
    </div>
  );
}

export const TwoClientAdoptionReselection: Story = {
  args: {
    phase: STEP_1_5,
    permissions: getBoardPermissions(STEP_1_5),
    notes: [
      buildNote({ id: "note-1", content: "前回選んだ候補", x: 40, y: 80 }),
      buildNote({ id: "note-2", content: "今回選ぶ候補", x: 300, y: 80 }),
    ],
  },
  render: (args) => <TwoClientAdoptionReselectionPreview args={args} />,
};

const STEP_3_5 = buildPhaseStep(5, 3);

export const TwoClientSharedIdeaAdoptionFocus: Story = {
  args: {
    phase: STEP_3_5,
    permissions: getBoardPermissions(STEP_3_5),
    notes: [
      buildNote({ id: "note-1", content: "共有中のアイデア", x: 50, y: 50 }),
    ],
  },
  render: (args) => <TwoClientAdoptionFocusPreview args={args} />,
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
    isAdoptMode: true,
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
