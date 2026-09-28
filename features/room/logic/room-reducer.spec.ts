import { describe, expect, it } from "vitest";
import type { RoomPhase } from "@/contracts/phase";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import type { ProtocolMember, ServerMessage } from "@/contracts/room-protocol";
import {
  buildCarryover,
  buildDecision,
} from "@/contracts/room-protocol.fixture";
import {
  applyAdoptionFocusServerMessage,
  applyCarryoverServerMessage,
  applyDecisionServerMessage,
  applyIdeaMapServerMessage,
  applyMemberServerMessage,
  applyPhaseServerMessage,
  applyTimerServerMessage,
  applyVotingCompletionServerMessage,
} from "./room-reducer";

const A: ProtocolMember = {
  userId: "11111111-1111-4111-8111-111111111111",
  name: "Yuki Tanaka",
  color: "yellow",
};
const B: ProtocolMember = {
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Taro Yamada",
  color: "green",
};
const LOBBY = buildLobbyPhase();

describe("applyIdeaMapServerMessage", () => {
  it("snapshotでサイズと初期化状態を復元する", () => {
    expect(
      applyIdeaMapServerMessage(
        { sizeLevel: 0, initialized: false, isDragging: false },
        {
          type: "snapshot",
          phaseRevision: 0,
          notes: [],
          members: [A],
          phase: buildPhaseStep(3, 2),
          isHost: true,
          decision: null,
          carryovers: [],
          completedVoterIds: [],
          timer: { status: "idle" },
          serverNow: 1_000,
          ideaMapSizeLevel: 3,
          ideaMapSizeInitialized: true,
          ideaMapDragging: true,
        },
      ),
    ).toEqual({ sizeLevel: 3, initialized: true, isDragging: true });
  });

  it("匿名のidea-map stateを反映する", () => {
    expect(
      applyIdeaMapServerMessage(
        { sizeLevel: 0, initialized: false, isDragging: false },
        {
          type: "idea-map:state",
          sizeLevel: 2,
          initialized: true,
          isDragging: false,
        },
      ),
    ).toEqual({ sizeLevel: 2, initialized: true, isDragging: false });
  });
});

describe("applyMemberServerMessage", () => {
  it("snapshot.members で members state を丸ごと置き換える", () => {
    const message: ServerMessage = {
      type: "snapshot",
      phaseRevision: 0,
      notes: [],
      members: [A, B],
      phase: LOBBY,
      isHost: true,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: 1_000,
    };
    expect(applyMemberServerMessage([], message)).toEqual([A, B]);
  });

  it("member_joined で新しいメンバーを追加する", () => {
    const message: ServerMessage = {
      type: "member_joined",
      member: B,
    };
    expect(applyMemberServerMessage([A], message)).toEqual([A, B]);
  });

  it("member_joined で同一 userId は name を最新化して反映（重複しない）", () => {
    const renamed: ProtocolMember = {
      userId: A.userId,
      name: "新しい名前",
      color: "yellow",
    };
    const message: ServerMessage = {
      type: "member_joined",
      member: renamed,
    };
    const result = applyMemberServerMessage([A, B], message);
    expect(result).toEqual([renamed, B]);
    // 同じ userId の重複がない
    expect(result.filter((m) => m.userId === A.userId)).toHaveLength(1);
  });

  it("ノート系メッセージは members を変えない", () => {
    const message: ServerMessage = {
      type: "note:inserted",
      note: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        authorId: A.userId,
        content: "",
        contentRevision: 0,
        visibility: "shared",
        excluded: false,
        color: "yellow",
        fontSize: 14,
        x: 0,
        y: 0,
        stackOrder: 0,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        dotVotes: {
          subjective: { count: 0, votedByMe: false, ownCount: 0 },
          objective: { count: 0, votedByMe: false, ownCount: 0 },
        },
        dotVoteStickers: [],
      },
    };
    expect(applyMemberServerMessage([A], message)).toEqual([A]);
  });

  it("phase:updated は members を変えない", () => {
    const message: ServerMessage = {
      type: "phase:updated",
      phaseRevision: 0,
      phase: buildPhaseStep(1),
    };
    expect(applyMemberServerMessage([A], message)).toEqual([A]);
  });

  it("decision:updated は members を変えない", () => {
    const message: ServerMessage = {
      type: "decision:updated",
      decision: {
        phase: 1,
        noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        decidedBy: A.userId,
      },
    };
    expect(applyMemberServerMessage([A], message)).toEqual([A]);
  });

  it("member_left で退出したユーザーを members から取り除く", () => {
    const message: ServerMessage = {
      type: "member_left",
      userId: A.userId,
    };
    expect(applyMemberServerMessage([A, B], message)).toEqual([B]);
  });

  it("member_left で存在しない userId は何も変えない", () => {
    const message: ServerMessage = {
      type: "member_left",
      userId: "44444444-4444-4444-8444-444444444444",
    };
    expect(applyMemberServerMessage([A, B], message)).toEqual([A, B]);
  });
});

describe("applyVotingCompletionServerMessage", () => {
  it("投票完了イベントで完了者を追加・取り消しできる", () => {
    const completed = applyVotingCompletionServerMessage([], {
      type: "member_vote_status",
      userId: A.userId,
      isComplete: true,
    });

    expect(completed).toEqual([A.userId]);
    expect(
      applyVotingCompletionServerMessage(completed, {
        type: "member_vote_status",
        userId: A.userId,
        isComplete: false,
      }),
    ).toEqual([]);
  });

  it("フェーズ変更では前フェーズの完了状態を持ち越さない", () => {
    expect(
      applyVotingCompletionServerMessage([A.userId], {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(5),
      }),
    ).toEqual([]);
  });

  it("snapshot はサーバーから受け取った完了者一覧へ置き換える", () => {
    expect(
      applyVotingCompletionServerMessage([A.userId], {
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [A, B],
        completedVoterIds: [B.userId],
        phase: buildPhaseStep(4),
        isHost: true,
        decision: null,
        carryovers: [],
        timer: { status: "idle" },
        serverNow: 1_000,
      }),
    ).toEqual([B.userId]);
  });
});

describe("applyPhaseServerMessage", () => {
  it("初期値は lobby", () => {
    expect(
      applyPhaseServerMessage(LOBBY, {
        type: "error",
        code: "forbidden",
        message: "x",
      }),
    ).toEqual(LOBBY);
  });

  it("phase:updated で phase が進む", () => {
    expect(
      applyPhaseServerMessage(LOBBY, {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(1),
      }),
    ).toEqual(buildPhaseStep(1));
    expect(
      applyPhaseServerMessage(buildPhaseStep(1), {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(2),
      }),
    ).toEqual(buildPhaseStep(2));
  });

  it("ノート系メッセージは phase を変えない", () => {
    const message: ServerMessage = {
      type: "note:inserted",
      note: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        authorId: A.userId,
        content: "",
        contentRevision: 0,
        visibility: "shared",
        excluded: false,
        color: "yellow",
        fontSize: 14,
        x: 0,
        y: 0,
        stackOrder: 0,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        dotVotes: {
          subjective: { count: 0, votedByMe: false, ownCount: 0 },
          objective: { count: 0, votedByMe: false, ownCount: 0 },
        },
        dotVoteStickers: [],
      },
    };
    expect(applyPhaseServerMessage(LOBBY, message)).toEqual(LOBBY);
  });

  it("member_joined は phase を変えない", () => {
    const message: ServerMessage = { type: "member_joined", member: B };
    expect(applyPhaseServerMessage(buildPhaseStep(1), message)).toEqual(
      buildPhaseStep(1),
    );
  });

  it("decision:updated は phase を変えない", () => {
    const message: ServerMessage = {
      type: "decision:updated",
      decision: {
        phase: 1,
        noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        decidedBy: A.userId,
      },
    };
    expect(applyPhaseServerMessage(buildPhaseStep(5), message)).toEqual(
      buildPhaseStep(5),
    );
  });

  it("snapshot.phase で再接続後の進行状態を復元する", () => {
    const message: ServerMessage = {
      type: "snapshot",
      phaseRevision: 0,
      notes: [],
      members: [A],
      phase: buildPhaseStep(1),
      isHost: true,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "running", endsAt: 10_000, durationMs: 10_000 },
      serverNow: 1_000,
    };
    expect(applyPhaseServerMessage(LOBBY as RoomPhase, message)).toEqual(
      buildPhaseStep(1),
    );
  });
});

describe("applyTimerServerMessage", () => {
  it("タイマー以外のメッセージでは状態を変えない", () => {
    const current = {
      timer: { status: "idle" } as const,
      serverOffsetMs: 0,
      timerUpdateVersion: 0,
    };
    expect(
      applyTimerServerMessage(
        current,
        { type: "phase:updated", phaseRevision: 0, phase: buildPhaseStep(2) },
        1_000,
      ),
    ).toBe(current);
  });

  it("snapshot と timer:updated からタイマーとサーバー時計補正を復元する", () => {
    const snapshot: Extract<ServerMessage, { type: "snapshot" }> = {
      type: "snapshot",
      phaseRevision: 0,
      notes: [],
      members: [A],
      phase: buildPhaseStep(1),
      isHost: true,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "running", endsAt: 10_000, durationMs: 10_000 },
      serverNow: 1_000,
    };
    expect(
      applyTimerServerMessage(
        {
          timer: { status: "idle" },
          serverOffsetMs: 0,
          timerUpdateVersion: 0,
        },
        snapshot,
        900,
      ),
    ).toEqual({
      timer: snapshot.timer,
      serverOffsetMs: 100,
      timerUpdateVersion: 0,
    });

    const updated: ServerMessage = {
      type: "timer:updated",
      timer: { status: "paused", remainingMs: 5_000, durationMs: 10_000 },
      serverNow: 2_000,
    };
    expect(
      applyTimerServerMessage(
        {
          timer: snapshot.timer,
          serverOffsetMs: 100,
          timerUpdateVersion: 0,
        },
        updated,
        1_850,
      ),
    ).toEqual({
      timer: updated.timer,
      serverOffsetMs: 150,
      timerUpdateVersion: 1,
    });
  });
});

describe("applyDecisionServerMessage", () => {
  const decision = buildDecision({ decidedBy: A.userId });

  it("decision:updated で最新の決定を反映する", () => {
    expect(
      applyDecisionServerMessage(null, {
        type: "decision:updated",
        decision,
      }),
    ).toEqual(decision);
  });

  it("decision:updated の null でサーバー権威の決定解除を反映する", () => {
    expect(
      applyDecisionServerMessage(decision, {
        type: "decision:updated",
        decision: null,
      }),
    ).toBeNull();
  });

  it("snapshot の決定状態で再接続後の表示を復元する", () => {
    expect(
      applyDecisionServerMessage(null, {
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [A],
        phase: buildPhaseStep(5),
        isHost: true,
        decision,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 1_000,
      }),
    ).toEqual(decision);
  });

  it("phase:updated で前フェーズの決定をクリアする", () => {
    expect(
      applyDecisionServerMessage(decision, {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(2),
      }),
    ).toBeNull();
  });

  it("決定に関係しないメッセージでは現在の決定を維持する", () => {
    expect(
      applyDecisionServerMessage(decision, {
        type: "member_joined",
        member: B,
      }),
    ).toEqual(decision);
  });
});

describe("applyAdoptionFocusServerMessage", () => {
  const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("更新と明示解除を畳み込む", () => {
    expect(
      applyAdoptionFocusServerMessage(null, {
        type: "adoption-focus:updated",
        noteId,
      }),
    ).toBe(noteId);
    expect(
      applyAdoptionFocusServerMessage(noteId, {
        type: "adoption-focus:updated",
        noteId: null,
      }),
    ).toBeNull();
  });

  it("snapshot で復元し、確定とフェーズ遷移で解除する", () => {
    const snapshot: ServerMessage = {
      type: "snapshot",
      phaseRevision: 0,
      notes: [],
      members: [A],
      phase: buildPhaseStep(5),
      isHost: false,
      decision: null,
      adoptionFocusNoteId: noteId,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: 1_000,
    };
    expect(applyAdoptionFocusServerMessage(null, snapshot)).toBe(noteId);
    expect(
      applyAdoptionFocusServerMessage(noteId, {
        type: "decision:updated",
        decision: buildDecision({ noteId }),
      }),
    ).toBeNull();
    expect(
      applyAdoptionFocusServerMessage(noteId, {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(1, 2),
      }),
    ).toBeNull();
  });
});

describe("applyCarryoverServerMessage", () => {
  const carryover = buildCarryover();

  it("snapshot の carryovers で持ち越しを復元する", () => {
    expect(
      applyCarryoverServerMessage([], {
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [A],
        phase: buildPhaseStep(1, 2),
        isHost: true,
        decision: null,
        carryovers: [carryover],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 1_000,
      }),
    ).toEqual([carryover]);
  });

  it("phase:updated では持ち越しを維持する（フェーズ境界の真実は snapshot 再送が運ぶ）", () => {
    expect(
      applyCarryoverServerMessage([carryover], {
        type: "phase:updated",
        phaseRevision: 0,
        phase: buildPhaseStep(1, 2),
      }),
    ).toEqual([carryover]);
  });

  it("持ち越しに関係しないメッセージでは現在の持ち越しを維持する", () => {
    expect(
      applyCarryoverServerMessage([carryover], {
        type: "member_joined",
        member: B,
      }),
    ).toEqual([carryover]);
  });
});
