import type { RoomStepPhase } from "@/contracts/phase";
import type { ProtocolMember, TimerState } from "@/contracts/room-protocol";
import {
  getOperationBoardData,
  getPrimaryDragPointer,
  type OperationBoardData,
  type OperationMoment,
} from "../data/operation-demo-state";
import type { OperationSegmentId } from "../timeline";
import { mix, snap } from "./launch-motion";

export const LAUNCH_FPS = 60;
export const LAUNCH_DURATION_FRAMES = 2520;
export const LAUNCH_SCENES = [
  {
    id: "blank",
    from: 0,
    duration: 180,
    copy: "アイデア出し、\n止まってない？",
    eyebrow: "FOR YOUR NEXT TEAM IDEA",
  },
  {
    id: "problems",
    from: 180,
    duration: 240,
    copy: "",
    eyebrow: "WHERE DO WE START?",
  },
  {
    id: "brand",
    from: 420,
    duration: 120,
    copy: "Idea Boost",
    eyebrow: "THINK. SHARE. DECIDE.",
  },
  {
    id: "room",
    from: 540,
    duration: 120,
    copy: "ここから、動き出す。",
    eyebrow: "START TOGETHER",
  },
  {
    id: "flow",
    from: 660,
    duration: 180,
    copy: "次にやることが、\n見えている。",
    eyebrow: "A CLEAR WAY FORWARD",
  },
  {
    id: "private",
    from: 840,
    duration: 240,
    copy: "まずは、\n自分の考えを。",
    eyebrow: "THINK FOR YOURSELF",
  },
  {
    id: "share",
    from: 1080,
    duration: 180,
    copy: "持ち寄ると、広がる。",
    eyebrow: "MAKE ROOM FOR EVERY IDEA",
  },
  {
    id: "hints",
    from: 1260,
    duration: 240,
    copy: "見方を変える。",
    eyebrow: "A DIFFERENT PERSPECTIVE",
  },
  {
    id: "map",
    from: 1500,
    duration: 240,
    copy: "比べると、見えてくる。",
    eyebrow: "VALUE × FEASIBILITY",
  },
  {
    id: "vote",
    from: 1740,
    duration: 300,
    copy: "流されずに、選ぶ。",
    eyebrow: "YOUR OWN POINT OF VIEW",
  },
  {
    id: "decision",
    from: 2040,
    duration: 240,
    copy: "みんなで、一案へ。",
    eyebrow: "FROM IDEAS TO ONE DIRECTION",
  },
  {
    id: "closing",
    from: 2280,
    duration: 240,
    copy: "アイデア出しに困ったときは、これ。",
    eyebrow: "",
  },
] as const;

export type LaunchScene = (typeof LAUNCH_SCENES)[number];
export const LAUNCH_COPY = {
  problems: [
    "何から考える？",
    "どう広げる？",
    "どう決める？",
    "意見も、偏る。",
  ],
  phases: ["課題整理", "問いの作成", "アイデア決定"],
  issue: "小さいタスクを忘れてしまう",
  hmw: "もっと簡単にタスクを見える化できる？",
  idea: "今日やる小さなタスクだけを表示する",
  draft: "タスクをすべてまとめて管理する",
  hint: "小さくしたら使いやすくならないか？",
  private: "自分にだけ見える",
  vote: "投票中は、自分の票だけ。",
  result: "投票結果を参考に、みんなで決める。",
  roomCode: "AB12CD",
} as const;

export const LAUNCH_MEMBERS: ProtocolMember[] = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Yuki",
    color: "yellow",
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Taro",
    color: "green",
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    name: "Hana",
    color: "blue",
  },
  {
    userId: "44444444-4444-4444-8444-444444444444",
    name: "Mei",
    color: "pink",
  },
];

export type LaunchState = {
  frame: number;
  scene: LaunchScene;
  localFrame: number;
  moment: OperationMoment;
  board: OperationBoardData;
  currentUserId: string;
  renderTimeMs: number;
  timer: TimerState;
  votesPlaced: number;
  revealed: boolean;
  pointer: { x: number; y: number } | null;
};

function momentFor(
  segmentId: OperationSegmentId,
  progress: number,
): OperationMoment {
  const match = /phase-(\d)-step-(\d)/.exec(segmentId);
  const phase = match
    ? ({
        kind: "step",
        phase: Number(match[1]),
        step: Number(match[2]),
      } as RoomStepPhase)
    : ({ kind: "step", phase: 3, step: 5 } as const);
  return {
    screen: "board",
    segmentId,
    phase,
    progress,
    localFrame: Math.round(progress * 240),
    durationInFrames: 240,
    showVoteResult: false,
    decisionPhase: null,
  };
}

export function getLaunchState(inputFrame: number): LaunchState {
  const frame = Math.max(0, Math.min(LAUNCH_DURATION_FRAMES - 1, inputFrame));
  const scene =
    LAUNCH_SCENES.find((s) => frame >= s.from && frame < s.from + s.duration) ??
    LAUNCH_SCENES[0];
  const localFrame = frame - scene.from;
  const progress = localFrame / scene.duration;
  let segmentId: OperationSegmentId = "home";
  let operationProgress = progress;
  if (scene.id === "flow")
    segmentId =
      localFrame < 60
        ? "phase-1-step-3"
        : localFrame < 120
          ? "phase-2-step-1"
          : "phase-3-step-1";
  if (scene.id === "private") segmentId = "phase-1-step-1";
  if (scene.id === "share") segmentId = "phase-1-step-2";
  if (scene.id === "hints") segmentId = "phase-3-step-1";
  if (scene.id === "map") segmentId = "phase-3-step-3";
  const revealed = scene.id === "vote" && localFrame >= 260;
  if (scene.id === "vote") {
    segmentId = revealed ? "phase-3-step-5" : "phase-3-step-4";
    operationProgress = 0;
  }
  if (scene.id === "decision") {
    segmentId = "phase-3-step-5";
    operationProgress = localFrame >= 126 ? 1 : 0;
  }
  if (scene.id === "closing") segmentId = "complete";
  const moment = momentFor(segmentId, operationProgress);
  const board = getOperationBoardData(moment);
  const operationPointer = getPrimaryDragPointer(moment);
  let pointer = operationPointer
    ? { x: operationPointer.x - 96, y: operationPointer.y - 54 }
    : null;
  if (scene.id === "share") {
    const allNotes = getOperationBoardData(
      momentFor("phase-1-step-2", 1),
    ).notes.slice(0, 4);
    const own = { ...allNotes[0], visibility: "private" as const };
    const moving = localFrame >= 12 && localFrame < 104;
    const move = localFrame >= 104 ? 1 : snap(localFrame, 12, 1.0);
    const x = mix(1499, 480, move);
    const y = mix(746, 320, move);
    board.notes = allNotes.flatMap((note, index) =>
      localFrame >= 104 + index * 8
        ? [{ ...note, x: 480 + index * 280, y: 320 }]
        : [],
    );
    board.privateNotes = localFrame < 12 ? [own] : [];
    board.dragGhost = moving ? { note: own, x, y } : null;
    board.draggingNoteId = moving ? own.id : null;
    board.remoteCursors = board.notes.slice(1).map((note, index) => ({
      ...LAUNCH_MEMBERS[index + 1],
      x: note.x + 20,
      y: note.y + 20,
      draggingNoteId: null,
      lastSeenAt: 0,
      isIdle: false,
    }));
    pointer = { x: x + 20, y: y + 20 };
  }
  const votesPlaced =
    scene.id === "vote"
      ? Math.min(4, Math.max(0, Math.floor((localFrame - 55) / 44) + 1))
      : 0;
  if (scene.id === "vote" && !revealed) {
    board.notes = board.notes.map((note, index) => {
      const subjective = index === 0 && votesPlaced >= 1;
      const objective = index < 3 && votesPlaced >= index + 2;
      return {
        ...note,
        dotVotes: {
          subjective: { ownCount: subjective ? 1 : 0, votedByMe: subjective },
          objective: { ownCount: objective ? 1 : 0, votedByMe: objective },
        },
        dotVoteStickers: note.dotVoteStickers.filter((sticker) =>
          sticker.kind === "subjective" ? subjective : objective,
        ),
      };
    });
    board.remoteCursors = [];
  }
  if (scene.id === "hints") {
    const content =
      localFrame < 130
        ? LAUNCH_COPY.draft
        : LAUNCH_COPY.idea.slice(
            0,
            Math.min(
              LAUNCH_COPY.idea.length,
              Math.floor((localFrame - 130) / 3),
            ),
          );
    board.privateNotes = board.privateNotes.map((note) => ({
      ...note,
      content,
    }));
  }
  if (revealed || scene.id === "decision" || scene.id === "closing") {
    board.notes = board.notes.map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: {
          count: [2, 1, 1, 0][index],
          ownCount: 0,
          votedByMe: false,
        },
        objective: {
          count: [5, 3, 2, 2][index],
          ownCount: 0,
          votedByMe: false,
        },
      },
    }));
  }
  return {
    frame,
    scene,
    localFrame,
    moment,
    board,
    currentUserId: LAUNCH_MEMBERS[0].userId,
    renderTimeMs: (localFrame * 1000) / 60,
    timer:
      scene.id === "private" && localFrame >= 36
        ? { status: "running", durationMs: 180000, endsAt: 180600 }
        : { status: "idle" },
    votesPlaced,
    revealed,
    pointer,
  };
}
