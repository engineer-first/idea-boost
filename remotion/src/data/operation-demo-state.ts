import { NOTE_HEIGHT, NOTE_WIDTH } from "../../../contracts/board";
import type { PersistentGroup } from "../../../contracts/grouping";
import {
  isCursorSharingAllowed,
  type RoomPhase,
  type RoomStepPhase,
} from "../../../contracts/phase";
import type {
  Decision,
  DotVoteKind,
  NoteColor,
  ProtocolMember,
  ProtocolNote,
} from "../../../contracts/room-protocol";
import type { RemoteNoteDrag } from "../../../features/notes/logic/remote-note-drag";
import type { RenderedRemoteCursorPresence } from "../../../features/room/logic/cursor-presence";
import {
  IDEA_VALUE_FEASIBILITY_MAP_HEIGHT,
  IDEA_VALUE_FEASIBILITY_MAP_WIDTH,
} from "../../../features/room/logic/idea-value-feasibility-map";
import { PRODUCT_STAGE } from "../stage-geometry";
import {
  getOperationTimeline,
  OPERATION_DEMO_FPS,
  type OperationSegmentId,
} from "../timeline";

export type OperationScreen = "home" | "lobby" | "board";

export type OperationMoment = {
  screen: OperationScreen;
  segmentId: OperationSegmentId;
  localFrame: number;
  durationInFrames: number;
  progress: number;
  phase: RoomPhase | null;
  showVoteResult: boolean;
  decisionPhase: 1 | 2 | 3 | null;
};

export type OperationBoardData = {
  notes: ProtocolNote[];
  privateNotes: ProtocolNote[];
  groups: PersistentGroup[];
  decision: Decision | null;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  draggingNoteId: string | null;
  dragGhost: { note: ProtocolNote; x: number; y: number } | null;
  viewportDragGhost: { note: ProtocolNote; x: number; y: number } | null;
  remoteCursors: RenderedRemoteCursorPresence[];
  remoteNoteDrags: RemoteNoteDrag[];
};

const CURRENT_USER_ID = "11111111-1111-4111-8111-111111111111";
const TARO_USER_ID = "22222222-2222-4222-8222-222222222222";
const HANAKO_USER_ID = "33333333-3333-4333-8333-333333333333";
const MEI_USER_ID = "44444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-09-10T00:00:00.000Z";
const DECIDED_ISSUE = "小さいタスクを忘れてしまう";
const DECIDED_HMW = "もっと簡単にタスクを見える化できる？";

// 現行のマイ付箋ドック（付箋1枚を表示した状態）における付箋の左上。
// RoomBoardCanvas の世界座標で持ち、ドラッグ開始時のゴーストと
// InteractionOverlay のカーソルが同じ場所から出るように共有する。
export const PRIMARY_DRAG_SOURCE = { x: 1499, y: 746 } as const;
export const PRIMARY_DRAG_TARGET = { x: 250, y: 220 } as const;

const POINTER_GRAB_OFFSET = 20;
const DRAG_START = 0.08;
const DRAG_END = 0.58;
const IDEA_EVALUATION_TARGETS = [
  [78, 86],
  [58, 72],
  [70, 52],
  [42, 64],
  [24, 82],
  [42, 76],
  [60, 68],
  [80, 58],
  [18, 58],
  [36, 50],
  [54, 42],
  [72, 34],
  [26, 32],
  [44, 26],
  [62, 20],
  [80, 14],
] as const;

type NoteSeed = {
  id: string;
  content: string;
  color: NoteColor;
  x: number;
  y: number;
};

const DEMO_AUTHOR_COLORS = ["yellow", "green", "blue", "pink"] as const;

function buildAdditionalSeeds(
  prefix: "a" | "b" | "c",
  contents: readonly string[],
  positions: readonly (readonly [number, number])[],
): NoteSeed[] {
  return contents.map((content, index) => {
    const position = positions[index] ?? [0, 0];
    const suffix = (index + 5).toString(16).padStart(2, "0");
    return {
      id: `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${prefix.repeat(10)}${suffix}`,
      content,
      color: DEMO_AUTHOR_COLORS[index % DEMO_AUTHOR_COLORS.length],
      x: position[0],
      y: position[1],
    };
  });
}

const COLLABORATORS: readonly ProtocolMember[] = [
  { userId: TARO_USER_ID, name: "Taro Yamada", color: "green" },
  { userId: HANAKO_USER_ID, name: "Hanako Sato", color: "blue" },
  { userId: MEI_USER_ID, name: "Mei Suzuki", color: "pink" },
];

const AUTHOR_BY_COLOR: Partial<Record<NoteColor, string>> = {
  yellow: CURRENT_USER_ID,
  green: TARO_USER_ID,
  blue: HANAKO_USER_ID,
  pink: MEI_USER_ID,
};

const ISSUE_NOTE_SEEDS: readonly NoteSeed[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    content: "小さいタスクを忘れてしまう",
    color: "yellow",
    x: 250,
    y: 220,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    content: "やることの優先順位をつけづらい",
    color: "green",
    x: 530,
    y: 270,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    content: "締切を見落としてしまう",
    color: "blue",
    x: 850,
    y: 210,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    content: "チームの進み具合が分からない",
    color: "pink",
    x: 1090,
    y: 390,
  },
  ...buildAdditionalSeeds(
    "a",
    [
      "通知が多くて重要なものを見逃す",
      "誰が担当かすぐに分からない",
      "作業の途中で別のことを始めてしまう",
      "予定を立てても崩れてしまう",
      "今日やることを毎回探している",
      "タスクの粒度がそろわない",
      "完了したか確認しづらい",
      "相談するタイミングが難しい",
      "締切までの残り日数を忘れる",
      "先延ばしにしてしまう",
      "メモがいろいろな場所に散らばる",
      "チームの変更に気づけない",
    ],
    [
      [1400, 180],
      [1400, 380],
      [1400, 580],
      [1400, 780],
      [180, 580],
      [400, 580],
      [620, 580],
      [840, 580],
      [1060, 580],
      [1280, 580],
      [180, 780],
      [400, 780],
    ],
  ),
];

const HMW_NOTE_SEEDS: readonly NoteSeed[] = [
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    content: "もっと簡単にタスクを見える化できる？",
    color: "yellow",
    x: 430,
    y: 270,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    content: "もっと楽しく最初の一歩を踏み出せる？",
    color: "green",
    x: 760,
    y: 350,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    content: "もっと安心して締切を管理できる？",
    color: "blue",
    x: 1050,
    y: 240,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
    content: "もっとチームで気軽に相談できる？",
    color: "pink",
    x: 1290,
    y: 330,
  },
  ...buildAdditionalSeeds(
    "b",
    [
      "もっと迷わず今日のタスクを選べる？",
      "もっと自然に優先順位を相談できる？",
      "もっと進捗を一目で共有できる？",
      "もっと締切を思い出せる仕組みを作れる？",
      "もっと集中を続けやすくできる？",
      "もっと分担を公平に決められる？",
      "もっと完了をチームで喜べる？",
      "もっと困ったときに助けを求められる？",
      "もっと予定変更に柔軟に対応できる？",
      "もっと情報を一か所に集められる？",
      "もっと次の一歩を小さく始められる？",
      "もっとチームの変化を見逃さずに済む？",
    ],
    [
      [140, 160],
      [380, 160],
      [620, 160],
      [860, 160],
      [1100, 160],
      [1340, 160],
      [140, 390],
      [380, 390],
      [620, 390],
      [860, 390],
      [1100, 390],
      [1340, 390],
      [140, 620],
    ],
  ),
];

const IDEA_NOTE_SEEDS: readonly NoteSeed[] = [
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    content: "今日やる小さなタスクだけを表示する",
    color: "yellow",
    x: 72,
    y: 78,
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
    content: "締切前にチームで声をかけ合う",
    color: "green",
    x: 48,
    y: 66,
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
    content: "完了したタスクを連続記録する",
    color: "blue",
    x: 64,
    y: 43,
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
    content: "作業開始をワンタップで共有する",
    color: "pink",
    x: 35,
    y: 54,
  },
  ...buildAdditionalSeeds(
    "c",
    [
      "今日の集中時間をチームに共有する",
      "締切から逆算して順番を提案する",
      "終わったことを毎晩ふりかえる",
      "困りごとを匿名で相談できるようにする",
      "次にやる一件だけを大きく表示する",
      "チームの予定をカレンダーで重ねる",
      "作業中は通知をまとめて届ける",
      "タスクを小さなカードに分けて並べる",
      "助けが必要なタスクを色で知らせる",
      "メンバーの得意分野から担当を提案する",
      "週の終わりに進捗を自動でまとめる",
      "変更されたタスクだけを知らせる",
    ],
    [
      [20, 18],
      [38, 18],
      [56, 18],
      [74, 18],
      [20, 36],
      [38, 36],
      [56, 36],
      [74, 36],
      [20, 54],
      [38, 54],
      [56, 54],
      [74, 54],
    ],
  ),
];

const ISSUE_GROUPS: PersistentGroup[] = [
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    name: "忘れ・見落とし",
    noteIds: [0, 2, 4, 8, 12, 14].map((index) => ISSUE_NOTE_SEEDS[index].id),
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
    name: "優先順位・集中",
    noteIds: [1, 6, 7, 9, 13].map((index) => ISSUE_NOTE_SEEDS[index].id),
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
    name: "チームの連携",
    noteIds: [3, 5, 10, 11, 15].map((index) => ISSUE_NOTE_SEEDS[index].id),
  },
];

const ISSUE_GROUP_TARGETS = ISSUE_NOTE_SEEDS.map(
  (seed): readonly [number, number] => {
    const groupIndex = ISSUE_GROUPS.findIndex((group) =>
      group.noteIds.includes(seed.id),
    );
    const slot = ISSUE_GROUPS[groupIndex].noteIds.indexOf(seed.id);
    return [
      90 + groupIndex * 550 + (slot % 2) * 215,
      200 + Math.floor(slot / 2) * 175,
    ];
  },
);

function createNote(
  seed: NoteSeed,
  overrides: Partial<ProtocolNote> = {},
): ProtocolNote {
  return {
    id: seed.id,
    authorId: AUTHOR_BY_COLOR[seed.color] ?? CURRENT_USER_ID,
    content: seed.content,
    visibility: "shared",
    color: seed.color,
    x: seed.x,
    y: seed.y,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
    dotVoteStickers: [],
    ...overrides,
  };
}

const TYPING_NOTE_INTERVAL = 0.2;
const TYPING_NOTE_DURATION = 0.18;
function draftPrivateNotes(
  seeds: readonly NoteSeed[],
  progress: number,
): ProtocolNote[] {
  return seeds
    .filter((seed) => seed.color === "yellow")
    .map((seed, index) => {
      const noteProgress = clampProgress(
        (progress - index * TYPING_NOTE_INTERVAL) / TYPING_NOTE_DURATION,
      );
      const typedLength = Math.max(
        1,
        Math.ceil(seed.content.length * noteProgress),
      );
      const isTyping = noteProgress < 1;
      return createNote(seed, {
        visibility: "private",
        x: 0,
        y: 0,
        content: `${seed.content.slice(0, typedLength)}${isTyping ? "▌" : ""}`,
      });
    })
    .filter((_note, index) => {
      const noteProgress = clampProgress(
        (progress - index * TYPING_NOTE_INTERVAL) / TYPING_NOTE_DURATION,
      );
      return progress >= index * TYPING_NOTE_INTERVAL && noteProgress > 0;
    });
}

function privateNotesDuringSharing(
  seeds: readonly NoteSeed[],
  moment: OperationMoment,
): ProtocolNote[] {
  const motions = getNoteMotions(moment);
  return seeds
    .filter((seed) => seed.color === "yellow")
    .filter(
      (seed) =>
        moment.progress <
        (motions.find((motion) => motion.noteId === seed.id)?.start ?? 1),
    )
    .map((seed) => createNote(seed, { visibility: "private", x: 0, y: 0 }));
}

// 投票中は受信者向け射影と同じく総票数を持たず、本人の投票状態だけを表示する。
const VOTE_ACTIONS = [
  { noteIndex: 0, kind: "subjective", x: 0.78, y: 0.2 },
  { noteIndex: 0, kind: "objective", x: 0.62, y: 0.34 },
  { noteIndex: 1, kind: "objective", x: 0.7, y: 0.46 },
  { noteIndex: 2, kind: "objective", x: 0.78, y: 0.58 },
] as const;

function actionWindow(index: number): { start: number; end: number } {
  return { start: 0.08 + index * 0.21, end: 0.23 + index * 0.21 };
}

function applyStealthVotes(
  notes: ProtocolNote[],
  moment: OperationMoment,
): ProtocolNote[] {
  return notes.map((note, index) => {
    const stickers = VOTE_ACTIONS.flatMap((action, actionIndex) =>
      action.noteIndex === index &&
      moment.progress >= actionWindow(actionIndex).end
        ? [
            {
              id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${actionIndex}`,
              kind: action.kind,
              x: action.x,
              y: action.y,
            },
          ]
        : [],
    );
    const subjective = stickers.filter(
      (sticker) => sticker.kind === "subjective",
    ).length;
    const objective = stickers.filter(
      (sticker) => sticker.kind === "objective",
    ).length;
    return {
      ...note,
      dotVotes: {
        subjective: { ownCount: subjective, votedByMe: subjective > 0 },
        objective: { ownCount: objective, votedByMe: objective > 0 },
      },
      dotVoteStickers: stickers,
    };
  });
}

export function getVoteDrag(
  moment: OperationMoment,
): { kind: DotVoteKind; x: number; y: number; isDragging: boolean } | null {
  const seeds =
    moment.segmentId === "phase-1-step-4"
      ? groupedIssueNotesAtTargets()
      : moment.segmentId === "phase-2-step-3"
        ? HMW_NOTE_SEEDS
        : moment.segmentId === "phase-3-step-4"
          ? evaluatedIdeaNotes()
          : null;
  if (!seeds) return null;
  const actionIndex = VOTE_ACTIONS.findIndex(
    (_action, index) => moment.progress < actionWindow(index).end,
  );
  const index = actionIndex < 0 ? VOTE_ACTIONS.length - 1 : actionIndex;
  const action = VOTE_ACTIONS[index];
  const window = actionWindow(index);
  const note = seeds[action.noteIndex];
  const origin =
    moment.segmentId === "phase-3-step-4" ? mapNoteTopLeft(note) : note;
  const point = movingPoint(
    moment.progress,
    [action.kind === "subjective" ? 770 : 880, PRODUCT_STAGE.height - 36],
    [origin.x + NOTE_WIDTH * action.x, origin.y + NOTE_HEIGHT * action.y],
    window.start,
    window.end,
  );
  return {
    ...point,
    kind: action.kind,
    isDragging: moment.progress >= window.start && moment.progress < window.end,
  };
}

function applyTotaledVotes(notes: ProtocolNote[]): ProtocolNote[] {
  return notes.map((note, index) => ({
    ...note,
    dotVotes: {
      subjective: {
        count: index === 0 ? 2 : index === 1 ? 1 : 0,
        votedByMe: false,
        ownCount: 0,
      },
      objective: {
        count: index === 0 ? 5 : Math.max(0, 3 - index),
        votedByMe: false,
        ownCount: 0,
      },
    },
  }));
}

function totaledVotes(seeds: readonly NoteSeed[]): ProtocolNote[] {
  return applyTotaledVotes(seeds.map((seed) => createNote(seed)));
}

function emptyBoardData(): OperationBoardData {
  return {
    notes: [],
    privateNotes: [],
    groups: [],
    decision: null,
    hmwDecidedIssue: null,
    decidedHmw: null,
    draggingNoteId: null,
    dragGhost: null,
    viewportDragGhost: null,
    remoteCursors: [],
    remoteNoteDrags: [],
  };
}

function decisionFor(phase: 1 | 2 | 3, noteId: string): Decision {
  return { phase, noteId, decidedBy: CURRENT_USER_ID };
}

function groupedIssueNotesAtTargets(): ProtocolNote[] {
  return ISSUE_NOTE_SEEDS.map((seed, index) => {
    const target = ISSUE_GROUP_TARGETS[index] ?? [seed.x, seed.y];
    return createNote({ ...seed, x: target[0], y: target[1] });
  });
}

function evaluatedIdeaNotes(): ProtocolNote[] {
  return IDEA_NOTE_SEEDS.map((seed, index) => {
    const target = IDEA_EVALUATION_TARGETS[index] ?? [seed.x, seed.y];
    return createNote({ ...seed, x: target[0], y: target[1] });
  });
}

function phaseFromSegmentId(
  segmentId: OperationSegmentId,
): RoomStepPhase | null {
  if (segmentId === "complete") {
    return { kind: "step", phase: 3, step: 5 };
  }

  const match = /^phase-([123])-step-([1-5])$/.exec(segmentId);
  if (!match) return null;

  return {
    kind: "step",
    phase: Number(match[1]) as 1 | 2 | 3,
    step: Number(match[2]),
  } as RoomStepPhase;
}

export function getOperationMoment(
  frame: number,
  fps = OPERATION_DEMO_FPS,
): OperationMoment {
  const timeline = getOperationTimeline(fps);
  const lastSegment = timeline.at(-1);
  const lastFrame = lastSegment
    ? lastSegment.from + lastSegment.durationInFrames - 1
    : 0;
  const clampedFrame = Math.min(Math.max(0, frame), lastFrame);
  const segment =
    timeline.find(
      (candidate) =>
        clampedFrame >= candidate.from &&
        clampedFrame < candidate.from + candidate.durationInFrames,
    ) ?? lastSegment;

  if (!segment) {
    throw new Error("Operation demo timeline must not be empty");
  }

  const localFrame = clampedFrame - segment.from;
  const phase = phaseFromSegmentId(segment.id);
  const screen =
    segment.id === "home" ? "home" : segment.id === "lobby" ? "lobby" : "board";
  const showVoteResult =
    segment.id === "phase-1-step-5" ||
    segment.id === "phase-2-step-4" ||
    segment.id === "phase-3-step-5";

  return {
    screen,
    segmentId: segment.id,
    localFrame,
    durationInFrames: segment.durationInFrames,
    progress:
      segment.durationInFrames <= 1
        ? 1
        : localFrame / (segment.durationInFrames - 1),
    phase,
    showVoteResult,
    decisionPhase: segment.id === "complete" ? 3 : null,
  };
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type Point = { x: number; y: number };
type DragSurface = "board" | "map" | "viewport";
type DragMotion = {
  noteId: string;
  surface: DragSurface;
  from: readonly [number, number];
  to: readonly [number, number];
  start: number;
  end: number;
};
type CollaboratorDragMotion = DragMotion & {
  member: ProtocolMember;
};

const MAP_AXIS_SIZE = 64;
const MAP_GAP = 12;
const MAP_LEFT =
  (PRODUCT_STAGE.width - IDEA_VALUE_FEASIBILITY_MAP_WIDTH) / 2 +
  MAP_AXIS_SIZE +
  MAP_GAP;
const MAP_TOP = (PRODUCT_STAGE.height - IDEA_VALUE_FEASIBILITY_MAP_HEIGHT) / 2;
const MAP_PLANE_WIDTH =
  IDEA_VALUE_FEASIBILITY_MAP_WIDTH - MAP_AXIS_SIZE - MAP_GAP;
const MAP_PLANE_HEIGHT =
  IDEA_VALUE_FEASIBILITY_MAP_HEIGHT - MAP_AXIS_SIZE - MAP_GAP;

function dragProgress(
  progress: number,
  start = DRAG_START,
  end = DRAG_END,
): number {
  const value = clampProgress((progress - start) / (end - start));
  return 1 - (1 - value) ** 3;
}

function movingPoint(
  progress: number,
  from: readonly [number, number],
  to: readonly [number, number],
  start = DRAG_START,
  end = DRAG_END,
): Point {
  const move = dragProgress(progress, start, end);
  return {
    x: from[0] + (to[0] - from[0]) * move,
    y: from[1] + (to[1] - from[1]) * move,
  };
}

function mapNoteTopLeft(point: Point): Point {
  const left = clampProgress(point.x / 100) * MAP_PLANE_WIDTH;
  const bottom = clampProgress(point.y / 100) * MAP_PLANE_HEIGHT;
  return {
    x:
      MAP_LEFT +
      Math.min(
        MAP_PLANE_WIDTH - NOTE_WIDTH,
        Math.max(0, left - NOTE_WIDTH / 2),
      ),
    y:
      MAP_TOP +
      MAP_PLANE_HEIGHT -
      Math.min(
        MAP_PLANE_HEIGHT - NOTE_HEIGHT,
        Math.max(0, bottom - NOTE_HEIGHT / 2),
      ) -
      NOTE_HEIGHT,
  };
}

function getNoteMotions(moment: OperationMoment): DragMotion[] {
  const seeds =
    moment.segmentId === "phase-1-step-2" ||
    moment.segmentId === "phase-1-step-3"
      ? ISSUE_NOTE_SEEDS
      : moment.segmentId === "phase-2-step-2"
        ? HMW_NOTE_SEEDS
        : moment.segmentId === "phase-3-step-2" ||
            moment.segmentId === "phase-3-step-3"
          ? IDEA_NOTE_SEEDS
          : null;
  if (!seeds) return [];
  const isSharing = moment.segmentId.endsWith("step-2");
  const isIdea = moment.segmentId.startsWith("phase-3");
  return seeds.map((seed, index) => {
    const authorIndex = DEMO_AUTHOR_COLORS.indexOf(
      seed.color as (typeof DEMO_AUTHOR_COLORS)[number],
    );
    const round = seeds
      .slice(0, index)
      .filter((candidate) => candidate.color === seed.color).length;
    const window = actionWindow(round);
    const offset = authorIndex * 0.012;
    const target = isSharing
      ? ([seed.x, seed.y] as const)
      : isIdea
        ? IDEA_EVALUATION_TARGETS[index]
        : ISSUE_GROUP_TARGETS[index];
    const viewportTarget =
      isIdea && isSharing && authorIndex === 0 ? mapNoteTopLeft(seed) : null;
    return {
      noteId: seed.id,
      surface: viewportTarget ? "viewport" : isIdea ? "map" : "board",
      from: isSharing
        ? isIdea && authorIndex !== 0
          ? [94, 10 + authorIndex * 8]
          : [PRIMARY_DRAG_SOURCE.x, PRIMARY_DRAG_SOURCE.y]
        : [seed.x, seed.y],
      to: viewportTarget ? [viewportTarget.x, viewportTarget.y] : target,
      start: window.start + offset,
      end: window.end + offset,
    };
  });
}

function getPrimaryDragMotions(moment: OperationMoment): DragMotion[] {
  return getNoteMotions(moment).filter((motion) =>
    [...ISSUE_NOTE_SEEDS, ...HMW_NOTE_SEEDS, ...IDEA_NOTE_SEEDS].some(
      (seed) => seed.id === motion.noteId && seed.color === "yellow",
    ),
  );
}

function getPrimaryDragMotion(moment: OperationMoment): DragMotion | null {
  const motions = getPrimaryDragMotions(moment);
  return (
    motions.find((motion) => moment.progress < motion.end) ??
    motions.at(-1) ??
    null
  );
}

function pointForMotion(moment: OperationMoment, motion: DragMotion): Point {
  return movingPoint(
    moment.progress,
    motion.from,
    motion.to,
    motion.start,
    motion.end,
  );
}

function isMotionActive(moment: OperationMoment, motion: DragMotion): boolean {
  return moment.progress >= motion.start && moment.progress < motion.end;
}

// 映像上のポインターと付箋は、必ず同じ DragMotion から位置を得る。
export function getPrimaryDragPointer(moment: OperationMoment): Point | null {
  const motion = getPrimaryDragMotion(moment);
  if (!motion) return null;

  const point = pointForMotion(moment, motion);
  const noteTopLeft = motion.surface === "map" ? mapNoteTopLeft(point) : point;
  return {
    x: PRODUCT_STAGE.left + noteTopLeft.x + POINTER_GRAB_OFFSET,
    y: PRODUCT_STAGE.top + noteTopLeft.y + POINTER_GRAB_OFFSET,
  };
}

function getCollaboratorMotions(
  moment: OperationMoment,
): CollaboratorDragMotion[] {
  if (moment.phase?.kind !== "step" || !isCursorSharingAllowed(moment.phase))
    return [];
  const motions = getNoteMotions(moment);
  const seeds = [...ISSUE_NOTE_SEEDS, ...HMW_NOTE_SEEDS, ...IDEA_NOTE_SEEDS];
  return COLLABORATORS.flatMap((member) => {
    const ownMotions = motions.filter((motion) =>
      seeds.some(
        (seed) => seed.id === motion.noteId && seed.color === member.color,
      ),
    );
    const motion =
      ownMotions.find((candidate) => moment.progress < candidate.end) ??
      ownMotions.at(-1);
    return motion ? [{ ...motion, member }] : [];
  });
}

function getCollaborationState(
  moment: OperationMoment,
): Pick<OperationBoardData, "remoteCursors" | "remoteNoteDrags"> {
  const remoteCursors = getCollaboratorMotions(moment).map(
    (motion): RenderedRemoteCursorPresence => {
      const point = pointForMotion(moment, motion);
      return {
        ...motion.member,
        x: motion.surface === "board" ? point.x + POINTER_GRAB_OFFSET : point.x,
        y: motion.surface === "board" ? point.y + POINTER_GRAB_OFFSET : point.y,
        // 現行プロダクトのカーソルは名前だけを表示する。
        draggingNoteId: null,
        lastSeenAt: 0,
        isIdle: false,
      };
    },
  );

  return { remoteCursors, remoteNoteDrags: [] };
}

function notesForSharing(
  seeds: readonly NoteSeed[],
  moment: OperationMoment,
): ProtocolNote[] {
  const motions = getNoteMotions(moment);
  return seeds.flatMap((seed) => {
    const motion = motions.find((candidate) => candidate.noteId === seed.id);
    if (!motion || moment.progress < motion.start) return [];
    if (seed.color === "yellow" && moment.progress < motion.end) return [];
    if (moment.progress >= motion.end) return [createNote(seed)];
    const point = pointForMotion(moment, motion);
    return [createNote({ ...seed, ...point })];
  });
}

function positionedNotes(
  seeds: readonly NoteSeed[],
  moment: OperationMoment,
): ProtocolNote[] {
  const motions = getNoteMotions(moment);
  return seeds.flatMap((seed) => {
    const motion = motions.find((candidate) => candidate.noteId === seed.id);
    if (!motion) return [createNote(seed)];
    if (seed.color === "yellow" && isMotionActive(moment, motion)) return [];
    return [createNote({ ...seed, ...pointForMotion(moment, motion) })];
  });
}

function activePrimarySeed(
  seeds: readonly NoteSeed[],
  moment: OperationMoment,
): NoteSeed {
  return (
    seeds.find((seed) => seed.id === getPrimaryDragMotion(moment)?.noteId) ??
    seeds[0]
  );
}

function primaryBoardDragGhost(
  seed: NoteSeed,
  moment: OperationMoment,
): OperationBoardData["dragGhost"] {
  const motion = getPrimaryDragMotion(moment);
  if (
    !motion ||
    motion.surface === "viewport" ||
    !isMotionActive(moment, motion)
  ) {
    return null;
  }
  const point = pointForMotion(moment, motion);
  return {
    note: createNote(seed, { visibility: "private" }),
    x: point.x,
    y: point.y,
  };
}

function primaryViewportDragGhost(
  seed: NoteSeed,
  moment: OperationMoment,
): OperationBoardData["viewportDragGhost"] {
  const motion = getPrimaryDragMotion(moment);
  if (motion?.surface !== "viewport" || !isMotionActive(moment, motion)) {
    return null;
  }
  const point = pointForMotion(moment, motion);
  return {
    note: createNote(seed, { visibility: "private" }),
    x: point.x,
    y: point.y,
  };
}

export function getOperationBoardData(
  moment: OperationMoment,
): OperationBoardData {
  const base = { ...emptyBoardData(), ...getCollaborationState(moment) };

  switch (moment.segmentId) {
    case "home":
    case "lobby":
      return base;
    case "phase-1-step-1":
      return {
        ...base,
        privateNotes: draftPrivateNotes(ISSUE_NOTE_SEEDS, moment.progress),
      };
    case "phase-1-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: notesForSharing(ISSUE_NOTE_SEEDS, moment),
        privateNotes: privateNotesDuringSharing(ISSUE_NOTE_SEEDS, moment),
        draggingNoteId: isDragging ? primaryMotion.noteId : null,
        dragGhost: primaryBoardDragGhost(
          activePrimarySeed(ISSUE_NOTE_SEEDS, moment),
          moment,
        ),
      };
    }
    case "phase-1-step-3": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: positionedNotes(ISSUE_NOTE_SEEDS, moment),
        draggingNoteId: isDragging ? primaryMotion.noteId : null,
        dragGhost: primaryBoardDragGhost(
          activePrimarySeed(ISSUE_NOTE_SEEDS, moment),
          moment,
        ),
        groups: ISSUE_GROUPS.flatMap((group) => {
          const noteIds = group.noteIds.filter((id) => {
            const motion = getNoteMotions(moment).find(
              (candidate) => candidate.noteId === id,
            );
            return motion && moment.progress >= motion.end;
          });
          return noteIds.length >= 2 ? [{ ...group, noteIds }] : [];
        }),
      };
    }
    case "phase-1-step-4":
      return {
        ...base,
        notes: applyStealthVotes(groupedIssueNotesAtTargets(), moment),
        groups: ISSUE_GROUPS,
      };
    case "phase-1-step-5":
      return {
        ...base,
        notes: applyTotaledVotes(groupedIssueNotesAtTargets()),
        groups: ISSUE_GROUPS,
        decision:
          moment.progress >= 0.72
            ? decisionFor(1, ISSUE_NOTE_SEEDS[0].id)
            : null,
      };
    case "phase-2-step-1":
      return {
        ...base,
        privateNotes: draftPrivateNotes(HMW_NOTE_SEEDS, moment.progress),
        hmwDecidedIssue: DECIDED_ISSUE,
      };
    case "phase-2-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: notesForSharing(HMW_NOTE_SEEDS, moment),
        privateNotes: privateNotesDuringSharing(HMW_NOTE_SEEDS, moment),
        draggingNoteId: isDragging ? primaryMotion.noteId : null,
        dragGhost: primaryBoardDragGhost(
          activePrimarySeed(HMW_NOTE_SEEDS, moment),
          moment,
        ),
        hmwDecidedIssue: DECIDED_ISSUE,
      };
    }
    case "phase-2-step-3":
      return {
        ...base,
        notes: applyStealthVotes(
          HMW_NOTE_SEEDS.map((seed) => createNote(seed)),
          moment,
        ),
        hmwDecidedIssue: DECIDED_ISSUE,
      };
    case "phase-2-step-4":
      return {
        ...base,
        notes: totaledVotes(HMW_NOTE_SEEDS),
        hmwDecidedIssue: DECIDED_ISSUE,
        decision:
          moment.progress >= 0.72 ? decisionFor(2, HMW_NOTE_SEEDS[0].id) : null,
      };
    case "phase-3-step-1":
      return {
        ...base,
        privateNotes: draftPrivateNotes(IDEA_NOTE_SEEDS, moment.progress),
        decidedHmw: DECIDED_HMW,
      };
    case "phase-3-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: notesForSharing(IDEA_NOTE_SEEDS, moment),
        privateNotes: privateNotesDuringSharing(IDEA_NOTE_SEEDS, moment),
        draggingNoteId: isDragging ? primaryMotion.noteId : null,
        viewportDragGhost: primaryViewportDragGhost(
          activePrimarySeed(IDEA_NOTE_SEEDS, moment),
          moment,
        ),
        decidedHmw: DECIDED_HMW,
      };
    }
    case "phase-3-step-3": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: positionedNotes(IDEA_NOTE_SEEDS, moment),
        draggingNoteId: isDragging ? primaryMotion.noteId : null,
        dragGhost: primaryBoardDragGhost(
          activePrimarySeed(IDEA_NOTE_SEEDS, moment),
          moment,
        ),
        decidedHmw: DECIDED_HMW,
      };
    }
    case "phase-3-step-4":
      return {
        ...base,
        notes: applyStealthVotes(evaluatedIdeaNotes(), moment),
        decidedHmw: DECIDED_HMW,
      };
    case "phase-3-step-5":
      return {
        ...base,
        notes: applyTotaledVotes(evaluatedIdeaNotes()),
        decidedHmw: DECIDED_HMW,
        decision:
          moment.progress >= 0.72
            ? decisionFor(3, IDEA_NOTE_SEEDS[0].id)
            : null,
      };
    case "complete":
      return {
        ...base,
        notes: applyTotaledVotes(evaluatedIdeaNotes()),
        decidedHmw: DECIDED_HMW,
        decision: decisionFor(3, IDEA_NOTE_SEEDS[0].id),
      };
    default: {
      const exhaustive: never = moment.segmentId;
      return exhaustive;
    }
  }
}

export function getOperationHelp(moment: OperationMoment): {
  kind: "hmw" | "idea" | "reference" | null;
  isOpen: boolean;
  tab: "write" | "expand";
} {
  const kind =
    moment.segmentId === "phase-2-step-1"
      ? "hmw"
      : moment.segmentId === "phase-3-step-1"
        ? "idea"
        : moment.segmentId === "phase-3-step-2"
          ? "reference"
          : null;
  return {
    kind,
    isOpen: kind === "hmw" || kind === "idea",
    tab:
      kind === "idea" && moment.progress >= 0.24 && moment.progress <= 0.86
        ? "expand"
        : "write",
  };
}
