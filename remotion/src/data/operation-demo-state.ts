import { NOTE_HEIGHT, NOTE_WIDTH } from "../../../contracts/board";
import type { PersistentGroup } from "../../../contracts/grouping";
import {
  isCursorSharingAllowed,
  type RoomPhase,
  type RoomStepPhase,
} from "../../../contracts/phase";
import type {
  Decision,
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
const ISSUE_GROUP_TARGETS = [
  [360, 280],
  [580, 300],
  [385, 455],
  [1030, 300],
] as const;
const IDEA_EVALUATION_TARGETS = [
  [78, 86],
  [58, 72],
  [70, 52],
  [42, 64],
] as const;

type NoteSeed = {
  id: string;
  content: string;
  color: NoteColor;
  x: number;
  y: number;
};

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
];

const ISSUE_GROUP_NOTE_IDS = [
  ISSUE_NOTE_SEEDS[0].id,
  ISSUE_NOTE_SEEDS[1].id,
  ISSUE_NOTE_SEEDS[2].id,
];

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

function privateNotesFrom(seeds: readonly NoteSeed[]): ProtocolNote[] {
  return seeds.map((seed) =>
    createNote(seed, { visibility: "private", x: 0, y: 0 }),
  );
}

// 投票中は受信者向け射影と同じく総票数を持たず、本人の投票状態だけを表示する。
function applyStealthVotes(notes: ProtocolNote[]): ProtocolNote[] {
  return notes.map((note, index) => ({
    ...note,
    dotVotes: {
      subjective: {
        votedByMe: index === 0,
        ownCount: index === 0 ? 1 : 0,
      },
      objective: {
        votedByMe: index < 3,
        ownCount: index < 3 ? 1 : 0,
      },
    },
    dotVoteStickers: [
      ...(index === 0
        ? [
            {
              id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${index}`,
              kind: "subjective" as const,
              x: 0.78,
              y: 0.2,
            },
          ]
        : []),
      ...(index < 3
        ? [
            {
              id: `ffffffff-ffff-4fff-8fff-fffffffffff${index}`,
              kind: "objective" as const,
              x: 0.62 + index * 0.08,
              y: 0.34 + index * 0.12,
            },
          ]
        : []),
    ],
  }));
}

function stealthVotes(seeds: readonly NoteSeed[]): ProtocolNote[] {
  return applyStealthVotes(seeds.map((seed) => createNote(seed)));
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

function getPrimaryDragMotion(moment: OperationMoment): DragMotion | null {
  switch (moment.segmentId) {
    case "phase-1-step-2":
      return {
        noteId: ISSUE_NOTE_SEEDS[0].id,
        surface: "board",
        from: [PRIMARY_DRAG_SOURCE.x, PRIMARY_DRAG_SOURCE.y],
        to: [PRIMARY_DRAG_TARGET.x, PRIMARY_DRAG_TARGET.y],
        start: DRAG_START,
        end: DRAG_END,
      };
    case "phase-1-step-3":
      return {
        noteId: ISSUE_NOTE_SEEDS[0].id,
        surface: "board",
        from: [ISSUE_NOTE_SEEDS[0].x, ISSUE_NOTE_SEEDS[0].y],
        to: ISSUE_GROUP_TARGETS[0],
        start: DRAG_START,
        end: 0.5,
      };
    case "phase-2-step-2":
      return {
        noteId: HMW_NOTE_SEEDS[0].id,
        surface: "board",
        from: [PRIMARY_DRAG_SOURCE.x, PRIMARY_DRAG_SOURCE.y],
        to: [HMW_NOTE_SEEDS[0].x, HMW_NOTE_SEEDS[0].y],
        start: DRAG_START,
        end: DRAG_END,
      };
    case "phase-3-step-2": {
      const target = mapNoteTopLeft({
        x: IDEA_NOTE_SEEDS[0].x,
        y: IDEA_NOTE_SEEDS[0].y,
      });
      return {
        noteId: IDEA_NOTE_SEEDS[0].id,
        surface: "viewport",
        from: [PRIMARY_DRAG_SOURCE.x, PRIMARY_DRAG_SOURCE.y],
        to: [target.x, target.y],
        start: DRAG_START,
        end: DRAG_END,
      };
    }
    case "phase-3-step-3":
      return {
        noteId: IDEA_NOTE_SEEDS[0].id,
        surface: "map",
        from: [IDEA_NOTE_SEEDS[0].x, IDEA_NOTE_SEEDS[0].y],
        to: IDEA_EVALUATION_TARGETS[0],
        start: DRAG_START,
        end: DRAG_END,
      };
    default:
      return null;
  }
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
  if (moment.phase?.kind !== "step" || !isCursorSharingAllowed(moment.phase)) {
    return [];
  }

  if (moment.segmentId === "phase-1-step-2") {
    return [
      {
        member: COLLABORATORS[0],
        noteId: ISSUE_NOTE_SEEDS[1].id,
        surface: "board",
        from: [1440, 620],
        to: [ISSUE_NOTE_SEEDS[1].x, ISSUE_NOTE_SEEDS[1].y],
        start: 0.1,
        end: 0.5,
      },
      {
        member: COLLABORATORS[1],
        noteId: ISSUE_NOTE_SEEDS[2].id,
        surface: "board",
        from: [1480, 660],
        to: [ISSUE_NOTE_SEEDS[2].x, ISSUE_NOTE_SEEDS[2].y],
        start: 0.14,
        end: 0.52,
      },
      {
        member: COLLABORATORS[2],
        noteId: ISSUE_NOTE_SEEDS[3].id,
        surface: "board",
        from: [1520, 540],
        to: [ISSUE_NOTE_SEEDS[3].x, ISSUE_NOTE_SEEDS[3].y],
        start: 0.18,
        end: 0.54,
      },
    ];
  }

  if (moment.segmentId === "phase-1-step-3") {
    return [
      {
        member: COLLABORATORS[0],
        noteId: ISSUE_NOTE_SEEDS[1].id,
        surface: "board",
        from: [ISSUE_NOTE_SEEDS[1].x, ISSUE_NOTE_SEEDS[1].y],
        to: ISSUE_GROUP_TARGETS[1],
        start: 0.1,
        end: 0.5,
      },
      {
        member: COLLABORATORS[1],
        noteId: ISSUE_NOTE_SEEDS[2].id,
        surface: "board",
        from: [ISSUE_NOTE_SEEDS[2].x, ISSUE_NOTE_SEEDS[2].y],
        to: ISSUE_GROUP_TARGETS[2],
        start: 0.14,
        end: 0.52,
      },
      {
        member: COLLABORATORS[2],
        noteId: ISSUE_NOTE_SEEDS[3].id,
        surface: "board",
        from: [ISSUE_NOTE_SEEDS[3].x, ISSUE_NOTE_SEEDS[3].y],
        to: ISSUE_GROUP_TARGETS[3],
        start: 0.18,
        end: 0.54,
      },
    ];
  }

  if (moment.segmentId === "phase-2-step-2") {
    return [
      {
        member: COLLABORATORS[0],
        noteId: HMW_NOTE_SEEDS[1].id,
        surface: "board",
        from: [1440, 620],
        to: [HMW_NOTE_SEEDS[1].x, HMW_NOTE_SEEDS[1].y],
        start: 0.12,
        end: 0.62,
      },
      {
        member: COLLABORATORS[1],
        noteId: HMW_NOTE_SEEDS[2].id,
        surface: "board",
        from: [1480, 660],
        to: [HMW_NOTE_SEEDS[2].x, HMW_NOTE_SEEDS[2].y],
        start: 0.17,
        end: 0.67,
      },
    ];
  }

  if (moment.segmentId === "phase-3-step-2") {
    return [
      {
        member: COLLABORATORS[0],
        noteId: IDEA_NOTE_SEEDS[1].id,
        surface: "map",
        from: [92, 15],
        to: [IDEA_NOTE_SEEDS[1].x, IDEA_NOTE_SEEDS[1].y],
        start: 0.1,
        end: 0.6,
      },
      {
        member: COLLABORATORS[1],
        noteId: IDEA_NOTE_SEEDS[2].id,
        surface: "map",
        from: [88, 25],
        to: [IDEA_NOTE_SEEDS[2].x, IDEA_NOTE_SEEDS[2].y],
        start: 0.14,
        end: 0.64,
      },
      {
        member: COLLABORATORS[2],
        noteId: IDEA_NOTE_SEEDS[3].id,
        surface: "map",
        from: [94, 35],
        to: [IDEA_NOTE_SEEDS[3].x, IDEA_NOTE_SEEDS[3].y],
        start: 0.18,
        end: 0.68,
      },
    ];
  }

  if (moment.segmentId === "phase-3-step-3") {
    return COLLABORATORS.map((member, index) => ({
      member,
      noteId: IDEA_NOTE_SEEDS[index + 1].id,
      surface: "map" as const,
      from: [IDEA_NOTE_SEEDS[index + 1].x, IDEA_NOTE_SEEDS[index + 1].y],
      to: IDEA_EVALUATION_TARGETS[index + 1],
      start: 0.1 + index * 0.04,
      end: 0.6 + index * 0.04,
    }));
  }

  return [];
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

function notesFollowingCollaborators(
  seeds: readonly NoteSeed[],
  moment: OperationMoment,
  hideBeforeDrag: boolean,
): ProtocolNote[] {
  const motions = getCollaboratorMotions(moment);
  return seeds.flatMap((seed) => {
    const motion = motions.find(({ noteId }) => noteId === seed.id);
    if (!motion) return [createNote(seed)];
    if (hideBeforeDrag && moment.progress < motion.start) return [];
    const point = pointForMotion(moment, motion);
    return [createNote({ ...seed, x: point.x, y: point.y })];
  });
}

function noteFollowingPrimaryDrag(
  seed: NoteSeed,
  moment: OperationMoment,
): ProtocolNote {
  const motion = getPrimaryDragMotion(moment);
  if (!motion || motion.noteId !== seed.id) return createNote(seed);
  const point = pointForMotion(moment, motion);
  return createNote({ ...seed, x: point.x, y: point.y });
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
    case "phase-1-step-1": {
      const privateNotes = privateNotesFrom(ISSUE_NOTE_SEEDS.slice(0, 1));
      const typedLength = Math.max(
        1,
        Math.round(
          privateNotes[0].content.length * Math.min(1, moment.progress * 1.7),
        ),
      );
      privateNotes[0] = {
        ...privateNotes[0],
        content: privateNotes[0].content.slice(0, typedLength),
      };
      return { ...base, privateNotes };
    }
    case "phase-1-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      const isPublished =
        primaryMotion !== null && moment.progress >= primaryMotion.end;
      const localNote = createNote(ISSUE_NOTE_SEEDS[0], {
        visibility: "private",
      });
      return {
        ...base,
        notes: [
          ...(isPublished ? [createNote(ISSUE_NOTE_SEEDS[0])] : []),
          ...notesFollowingCollaborators(
            ISSUE_NOTE_SEEDS.slice(1),
            moment,
            true,
          ),
        ],
        privateNotes:
          primaryMotion !== null && moment.progress < primaryMotion.start
            ? [localNote]
            : [],
        draggingNoteId: isDragging ? ISSUE_NOTE_SEEDS[0].id : null,
        dragGhost: primaryBoardDragGhost(ISSUE_NOTE_SEEDS[0], moment),
      };
    }
    case "phase-1-step-3": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: [
          ...(isDragging
            ? []
            : [noteFollowingPrimaryDrag(ISSUE_NOTE_SEEDS[0], moment)]),
          ...notesFollowingCollaborators(
            ISSUE_NOTE_SEEDS.slice(1),
            moment,
            false,
          ),
        ],
        draggingNoteId: isDragging ? ISSUE_NOTE_SEEDS[0].id : null,
        dragGhost: primaryBoardDragGhost(ISSUE_NOTE_SEEDS[0], moment),
        groups:
          moment.progress >= 0.56
            ? [
                {
                  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                  name: "タスクを忘れる",
                  noteIds: ISSUE_GROUP_NOTE_IDS,
                },
              ]
            : [],
      };
    }
    case "phase-1-step-4":
      return {
        ...base,
        notes: applyStealthVotes(groupedIssueNotesAtTargets()),
        groups: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "タスクを忘れる",
            noteIds: ISSUE_GROUP_NOTE_IDS,
          },
        ],
      };
    case "phase-1-step-5":
      return {
        ...base,
        notes: applyTotaledVotes(groupedIssueNotesAtTargets()),
        groups: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "タスクを忘れる",
            noteIds: ISSUE_GROUP_NOTE_IDS,
          },
        ],
        decision:
          moment.progress >= 0.72
            ? decisionFor(1, ISSUE_NOTE_SEEDS[0].id)
            : null,
      };
    case "phase-2-step-1":
      return {
        ...base,
        privateNotes: privateNotesFrom(HMW_NOTE_SEEDS.slice(0, 1)),
        hmwDecidedIssue: DECIDED_ISSUE,
      };
    case "phase-2-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      const isPublished =
        primaryMotion !== null && moment.progress >= primaryMotion.end;
      return {
        ...base,
        notes: [
          ...(isPublished ? [createNote(HMW_NOTE_SEEDS[0])] : []),
          ...notesFollowingCollaborators(HMW_NOTE_SEEDS.slice(1), moment, true),
        ],
        privateNotes:
          primaryMotion !== null && moment.progress < primaryMotion.start
            ? privateNotesFrom(HMW_NOTE_SEEDS.slice(0, 1))
            : [],
        draggingNoteId: isDragging ? HMW_NOTE_SEEDS[0].id : null,
        dragGhost: primaryBoardDragGhost(HMW_NOTE_SEEDS[0], moment),
        hmwDecidedIssue: DECIDED_ISSUE,
      };
    }
    case "phase-2-step-3":
      return {
        ...base,
        notes: stealthVotes(HMW_NOTE_SEEDS),
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
        privateNotes: privateNotesFrom(IDEA_NOTE_SEEDS.slice(0, 1)),
        decidedHmw: DECIDED_HMW,
      };
    case "phase-3-step-2": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      const isPublished =
        primaryMotion !== null && moment.progress >= primaryMotion.end;
      return {
        ...base,
        notes: [
          ...(isPublished ? [createNote(IDEA_NOTE_SEEDS[0])] : []),
          ...notesFollowingCollaborators(
            IDEA_NOTE_SEEDS.slice(1),
            moment,
            true,
          ),
        ],
        privateNotes:
          primaryMotion !== null && moment.progress < primaryMotion.start
            ? privateNotesFrom(IDEA_NOTE_SEEDS.slice(0, 1))
            : [],
        draggingNoteId: isDragging ? IDEA_NOTE_SEEDS[0].id : null,
        viewportDragGhost: primaryViewportDragGhost(IDEA_NOTE_SEEDS[0], moment),
        decidedHmw: DECIDED_HMW,
      };
    }
    case "phase-3-step-3": {
      const primaryMotion = getPrimaryDragMotion(moment);
      const isDragging =
        primaryMotion !== null && isMotionActive(moment, primaryMotion);
      return {
        ...base,
        notes: [
          ...(isDragging
            ? []
            : [noteFollowingPrimaryDrag(IDEA_NOTE_SEEDS[0], moment)]),
          ...notesFollowingCollaborators(
            IDEA_NOTE_SEEDS.slice(1),
            moment,
            false,
          ),
        ],
        draggingNoteId: isDragging ? IDEA_NOTE_SEEDS[0].id : null,
        dragGhost: primaryBoardDragGhost(IDEA_NOTE_SEEDS[0], moment),
        decidedHmw: DECIDED_HMW,
      };
    }
    case "phase-3-step-4":
      return {
        ...base,
        notes: applyStealthVotes(evaluatedIdeaNotes()),
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
