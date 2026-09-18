// ルーム内 WebSocket プロトコルの境界スキーマの単体テスト。
// - 各種 ServerMessage / ClientMessage の正常系
// - 想定外のフィールドや型違いを negative テストで弾く
// - parseClientMessage / parseServerMessage のラッパが「不正入力で null」
//   を返すことを保証する（接続維持の挙動は workers/room-protocol.spec.ts）
import { describe, expect, it } from "vitest";
import { buildLobbyPhase, buildPhaseStep } from "./phase.fixture";
import {
  ClientMessageSchema,
  DecisionSchema,
  MemberSchema,
  NOTE_COLOR_PALETTE,
  NoteColorSchema,
  NoteSchema,
  parseClientMessage,
  parseServerMessage,
  ServerMessageSchema,
  TimerStateSchema,
} from "./room-protocol";
import { buildDecision } from "./room-protocol.fixture";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const LOBBY = buildLobbyPhase();
const STEP_1_1 = buildPhaseStep(1);
const STEP_1_2 = buildPhaseStep(2);
const STEP_1_5 = buildPhaseStep(5);

describe("NoteColorSchema", () => {
  it("固定20色のパレットを受け入れ、重複を持たない", () => {
    expect(NOTE_COLOR_PALETTE).toHaveLength(20);
    expect(new Set(NOTE_COLOR_PALETTE).size).toBe(20);
    for (const color of NOTE_COLOR_PALETTE) {
      expect(NoteColorSchema.parse(color)).toBe(color);
    }
  });

  it("パレット外の色は拒否する", () => {
    expect(NoteColorSchema.safeParse("black").success).toBe(false);
  });
});

describe("TimerStateSchema", () => {
  it("負数や有限でない時刻・時間を拒否する", () => {
    expect(
      TimerStateSchema.safeParse({
        status: "running",
        endsAt: Number.POSITIVE_INFINITY,
        durationMs: 60_000,
      }).success,
    ).toBe(false);
    expect(
      TimerStateSchema.safeParse({
        status: "paused",
        remainingMs: -1,
        durationMs: 60_000,
      }).success,
    ).toBe(false);
    expect(
      TimerStateSchema.safeParse({
        status: "paused",
        remainingMs: 60_000,
        durationMs: 5_999_001,
      }).success,
    ).toBe(false);
  });

  it("idle / running / paused の共有状態を受け入れる", () => {
    expect(TimerStateSchema.parse({ status: "idle" })).toEqual({
      status: "idle",
    });
    expect(
      TimerStateSchema.parse({
        status: "running",
        endsAt: 1_700_000_060_000,
        durationMs: 60_000,
      }),
    ).toEqual({
      status: "running",
      endsAt: 1_700_000_060_000,
      durationMs: 60_000,
    });
    expect(
      TimerStateSchema.parse({
        status: "paused",
        remainingMs: 30_000,
        durationMs: 60_000,
      }),
    ).toEqual({
      status: "paused",
      remainingMs: 30_000,
      durationMs: 60_000,
    });
  });

  it("ended は 00:00 の共有終了状態として受け入れる", () => {
    expect(
      TimerStateSchema.parse({ status: "ended", durationMs: 60_000 }),
    ).toEqual({ status: "ended", durationMs: 60_000 });
  });

  it("ended に remainingMs や endsAt を持たせない", () => {
    expect(
      TimerStateSchema.safeParse({
        status: "ended",
        durationMs: 60_000,
        remainingMs: 0,
      }).success,
    ).toBe(false);
  });
});

describe("MemberSchema", () => {
  it("userId と name を受け入れる", () => {
    expect(
      MemberSchema.parse({
        userId: USER_A,
        name: "Yuki Tanaka",
        color: "yellow",
      }),
    ).toEqual({
      userId: USER_A,
      name: "Yuki Tanaka",
      color: "yellow",
    });
  });

  it("UUID でない userId は拒否する", () => {
    expect(
      MemberSchema.safeParse({ userId: "not-a-uuid", name: "x" }).success,
    ).toBe(false);
  });

  it("name が無いと拒否する", () => {
    expect(MemberSchema.safeParse({ userId: USER_A }).success).toBe(false);
  });
});

describe("DecisionSchema", () => {
  it("Decision fixtureを受け入れ、上書きした値を反映する", () => {
    const decision = buildDecision({ phase: 2, decidedBy: USER_B });

    expect(DecisionSchema.parse(decision)).toEqual(decision);
  });

  it("範囲外のフェーズを拒否する", () => {
    expect(
      DecisionSchema.safeParse({
        ...buildDecision(),
        phase: 4,
      }).success,
    ).toBe(false);
  });
});

describe("NoteSchema", () => {
  const note = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    authorId: USER_A,
    content: "個人メモ",
    color: "yellow",
    x: 100,
    y: 200,
    stackOrder: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
  };

  it.each(["private", "shared"])("visibility=%s を受け入れる", (visibility) => {
    expect(NoteSchema.parse({ ...note, visibility }).visibility).toBe(
      visibility,
    );
  });

  it("visibility が無い付箋は拒否する", () => {
    expect(NoteSchema.safeParse(note).success).toBe(false);
  });

  it("stackOrder は非負整数だけを受け入れる", () => {
    expect(NoteSchema.parse({ ...note, visibility: "shared" }).stackOrder).toBe(
      0,
    );
    for (const stackOrder of [-1, 0.5, Number.POSITIVE_INFINITY]) {
      expect(
        NoteSchema.safeParse({ ...note, visibility: "shared", stackOrder })
          .success,
      ).toBe(false);
    }
  });

  it("stackOrder が無い付箋は拒否する", () => {
    const { stackOrder: _, ...withoutStackOrder } = note;
    expect(
      NoteSchema.safeParse({ ...withoutStackOrder, visibility: "shared" })
        .success,
    ).toBe(false);
  });

  it("投票集計が未公開の付箋は count なしでも受け入れる", () => {
    const result = NoteSchema.safeParse({
      ...note,
      visibility: "shared",
      dotVotes: {
        subjective: { votedByMe: true, ownCount: 1 },
        objective: { votedByMe: false, ownCount: 0 },
      },
    });

    expect(result.success).toBe(true);
  });

  it("候補外状態を受け入れ、旧形式の付箋は候補として補完する", () => {
    expect(
      NoteSchema.parse({ ...note, visibility: "shared", excluded: true })
        .excluded,
    ).toBe(true);
    expect(NoteSchema.parse({ ...note, visibility: "shared" }).excluded).toBe(
      false,
    );
  });
});

describe("ServerMessageSchema", () => {
  it("ドラッグ開始・移動・終了を UUID の dragId で相関し、開始結果を受け入れる", () => {
    const dragId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const noteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    expect(
      ClientMessageSchema.parse({
        type: "note:drag:start",
        noteId,
        dragId,
      }),
    ).toMatchObject({ type: "note:drag:start", noteId, dragId });
    expect(
      ClientMessageSchema.parse({
        type: "note:drag:move",
        noteId,
        dragId,
        x: 10,
        y: 20,
      }),
    ).toMatchObject({ type: "note:drag:move", dragId, x: 10, y: 20 });
    expect(
      ClientMessageSchema.parse({
        type: "note:drag:end",
        noteId,
        dragId,
        position: null,
      }),
    ).toMatchObject({ type: "note:drag:end", dragId, position: null });
    expect(
      ServerMessageSchema.parse({
        type: "note:drag:result",
        dragId,
        accepted: true,
      }),
    ).toEqual({ type: "note:drag:result", dragId, accepted: true });
  });

  it("ドラッグ操作に userId / authorId を含めず、不正な dragId を拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "note:drag:start",
        noteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        dragId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      ClientMessageSchema.safeParse({
        type: "note:drag:start",
        noteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        dragId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        userId: USER_A,
        authorId: USER_B,
      }).success,
    ).toBe(false);
  });

  it("member_vote_status は完了状態だけを受け入れる", () => {
    const parsed = ServerMessageSchema.parse({
      type: "member_vote_status",
      userId: USER_A,
      isComplete: true,
    });

    expect(parsed).toEqual({
      type: "member_vote_status",
      userId: USER_A,
      isComplete: true,
    });
  });

  it("member_vote_status に投票先や票種を含めた入力は拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "member_vote_status",
      userId: USER_A,
      isComplete: true,
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "subjective",
    });

    expect(result.success).toBe(false);
  });

  it("snapshot は notes / members / phase / isHost / decision / carryovers / completedVoterIds を必須にする", () => {
    const parsed = ServerMessageSchema.parse({
      type: "snapshot",
      notes: [],
      members: [{ userId: USER_A, name: "Owner", color: "yellow" }],
      phase: LOBBY,
      isHost: true,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: 1_700_000_000_000,
    });
    expect(parsed).toEqual({
      type: "snapshot",
      notes: [],
      members: [{ userId: USER_A, name: "Owner", color: "yellow" }],
      phase: LOBBY,
      isHost: true,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: 1_700_000_000_000,
    });
  });

  it("snapshot に members フィールドが無いと拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "snapshot",
      notes: [],
      phase: LOBBY,
    });
    expect(result.success).toBe(false);
  });

  it("snapshot に carryovers フィールドが無いと拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "snapshot",
      notes: [],
      members: [],
      phase: LOBBY,
      isHost: false,
      decision: null,
      timer: { status: "idle" },
      serverNow: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("snapshot に phase フィールドが無いと拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "snapshot",
      notes: [],
      members: [{ userId: USER_A, name: "Owner", color: "yellow" }],
      isHost: true,
    });
    expect(result.success).toBe(false);
  });

  it("snapshot に isHost フィールドが無いと拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "snapshot",
      notes: [],
      members: [{ userId: USER_A, name: "Owner", color: "yellow" }],
      phase: LOBBY,
    });
    expect(result.success).toBe(false);
  });

  it("snapshot に decision フィールドが無いと拒否する", () => {
    const result = ServerMessageSchema.safeParse({
      type: "snapshot",
      notes: [],
      members: [{ userId: USER_A, name: "Owner", color: "yellow" }],
      phase: LOBBY,
      isHost: true,
      timer: { status: "idle" },
      serverNow: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("decision:updated はフェーズ・付箋・決定者を受け入れる", () => {
    expect(
      ServerMessageSchema.parse({
        type: "decision:updated",
        phase: 1,
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        decidedBy: USER_A,
      }),
    ).toEqual({
      type: "decision:updated",
      phase: 1,
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      decidedBy: USER_A,
    });
  });

  it("member_joined を受け入れる", () => {
    const parsed = ServerMessageSchema.parse({
      type: "member_joined",
      member: { userId: USER_A, name: "Owner", color: "yellow" },
    });
    expect(parsed).toEqual({
      type: "member_joined",
      member: { userId: USER_A, name: "Owner", color: "yellow" },
    });
  });

  it("phase:updated は lobby と課題整理ステップを受け入れる", () => {
    expect(
      ServerMessageSchema.parse({ type: "phase:updated", phase: LOBBY }),
    ).toEqual({ type: "phase:updated", phase: LOBBY });
    expect(
      ServerMessageSchema.parse({ type: "phase:updated", phase: STEP_1_1 }),
    ).toEqual({ type: "phase:updated", phase: STEP_1_1 });
    expect(
      ServerMessageSchema.parse({ type: "phase:updated", phase: STEP_1_2 }),
    ).toEqual({ type: "phase:updated", phase: STEP_1_2 });
    expect(
      ServerMessageSchema.parse({ type: "phase:updated", phase: STEP_1_5 }),
    ).toEqual({ type: "phase:updated", phase: STEP_1_5 });
  });

  it("phase:next クライアントメッセージを受け入れる", () => {
    expect(ClientMessageSchema.parse({ type: "phase:next" })).toEqual({
      type: "phase:next",
    });
  });

  it("phase:next は force フラグを受け入れ、パース結果に保持する", () => {
    expect(
      ClientMessageSchema.parse({ type: "phase:next", force: true }),
    ).toEqual({ type: "phase:next", force: true });
  });

  it("phase:next の force に boolean 以外は拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({ type: "phase:next", force: "yes" })
        .success,
    ).toBe(false);
  });

  it("error は voting-incomplete コードを受け入れる", () => {
    expect(
      ServerMessageSchema.parse({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      }),
    ).toEqual({
      type: "error",
      code: "voting-incomplete",
      message: "全員の主観・客観投票が完了していません。",
    });
  });

  it("error の未知の code は拒否する", () => {
    expect(
      ServerMessageSchema.safeParse({
        type: "error",
        code: "rate-limited",
        message: "x",
      }).success,
    ).toBe(false);
  });

  it("phase:updated に未知のフェーズは拒否する", () => {
    expect(
      ServerMessageSchema.safeParse({ type: "phase:updated", phase: "done" })
        .success,
    ).toBe(false);
  });

  it("旧 phase_changed は受け付けない", () => {
    expect(
      ServerMessageSchema.safeParse({
        type: "phase_changed",
        phase: STEP_1_1,
      }).success,
    ).toBe(false);
  });

  it("member_left を受け入れる", () => {
    const parsed = ServerMessageSchema.parse({
      type: "member_left",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed).toEqual({
      type: "member_left",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("member_left は userId が必要", () => {
    expect(ServerMessageSchema.safeParse({ type: "member_left" }).success).toBe(
      false,
    );
  });

  it("member_left の userId は UUID 形式", () => {
    expect(
      ServerMessageSchema.safeParse({ type: "member_left", userId: "not-uuid" })
        .success,
    ).toBe(false);
  });

  it("未知の type は拒否する", () => {
    expect(
      ServerMessageSchema.safeParse({ type: "unknown", payload: {} }).success,
    ).toBe(false);
  });
});

describe("ClientMessageSchema", () => {
  it("一括候補外は対象IDや認可情報を受け取らず、Undoはoperation IDだけを受け入れる", () => {
    const operationId = "33333333-3333-4333-8333-333333333333";
    expect(
      ClientMessageSchema.parse({
        type: "note:bulk-exclude",
        noteIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        isHost: true,
      }),
    ).toEqual({ type: "note:bulk-exclude" });
    expect(
      ClientMessageSchema.parse({
        type: "note:bulk-restore",
        operationId,
        noteIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        isHost: true,
      }),
    ).toEqual({ type: "note:bulk-restore", operationId });
    expect(
      ClientMessageSchema.safeParse({
        type: "note:bulk-restore",
        operationId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it.each([
    "note:exclude",
    "note:restore",
  ])("%s は付箋IDだけを受け入れ、認可情報を受け取らない", (type) => {
    expect(
      ClientMessageSchema.parse({
        type,
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        authorId: USER_B,
        isHost: true,
        x: 999,
        y: 999,
      }),
    ).toEqual({
      type,
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it.each([
    "note:exclude",
    "note:restore",
  ])("%s はUUIDでない付箋IDを拒否する", (type) => {
    expect(
      ClientMessageSchema.safeParse({ type, noteId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("note:drag:start は移動者情報をクライアントから受け取らない", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "note:drag:start",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        dragId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        draggedBy: {
          userId: USER_B,
          name: "spoofed",
          color: "red",
        },
      }).success,
    ).toBe(false);
  });

  it("cursor:update はボード座標と共有付箋の操作対象だけを受け入れる", () => {
    expect(
      ClientMessageSchema.parse({
        type: "cursor:update",
        x: -400,
        y: 300,
        draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        userId: USER_B,
        name: "spoofed",
      }),
    ).toEqual({
      type: "cursor:update",
      x: -400,
      y: 300,
      draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("cursor:update は範囲外座標と不正な操作対象を拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "cursor:update",
        x: 1_000_001,
        y: 0,
        draggingNoteId: null,
      }).success,
    ).toBe(false);
    expect(
      ClientMessageSchema.safeParse({
        type: "cursor:update",
        x: 0,
        y: 0,
        draggingNoteId: "private-note",
      }).success,
    ).toBe(false);
  });

  it("cursor:leave はペイロードなしで受け入れる", () => {
    expect(ClientMessageSchema.parse({ type: "cursor:leave" })).toEqual({
      type: "cursor:leave",
    });
  });

  it("投票シールの追加は操作IDと付箋内の相対座標を伴って受け入れる", () => {
    const operationId = "33333333-3333-4333-8333-333333333333";
    const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const stickerId = "44444444-4444-4444-8444-444444444444";

    expect(
      ClientMessageSchema.parse({
        type: "note:vote-sticker:add",
        noteId,
        stickerId,
        kind: "objective",
        x: 0.25,
        y: 0.75,
        operationId,
      }),
    ).toEqual({
      type: "note:vote-sticker:add",
      noteId,
      stickerId,
      kind: "objective",
      x: 0.25,
      y: 0.75,
      operationId,
    });
  });

  it("timer:start は 1ms〜99分59秒だけを受け入れる", () => {
    expect(
      ClientMessageSchema.parse({ type: "timer:start", durationMs: 1 }),
    ).toEqual({ type: "timer:start", durationMs: 1 });
    expect(
      ClientMessageSchema.parse({
        type: "timer:start",
        durationMs: 5_999_000,
      }),
    ).toEqual({ type: "timer:start", durationMs: 5_999_000 });
    for (const durationMs of [0, -1, 5_999_001, 1.5]) {
      expect(
        ClientMessageSchema.safeParse({ type: "timer:start", durationMs })
          .success,
      ).toBe(false);
    }
  });

  it.each([
    "timer:pause",
    "timer:resume",
    "timer:extend",
    "timer:stop",
  ])("%s はペイロードなしで受け入れる", (type) => {
    expect(ClientMessageSchema.parse({ type })).toEqual({ type });
  });

  it("note:publish は付箋IDとボード座標を受け入れる", () => {
    expect(
      ClientMessageSchema.parse({
        type: "note:publish",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        x: 400,
        y: 300,
      }),
    ).toMatchObject({ type: "note:publish", x: 400, y: 300 });
  });

  it("note:publish は旧ボード範囲外を含む負の座標を受け入れる", () => {
    expect(
      ClientMessageSchema.parse({
        type: "note:publish",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        x: -4_000,
        y: 3_000,
      }),
    ).toMatchObject({ type: "note:publish", x: -4_000, y: 3_000 });
  });

  it("note:publish は安全上限を超える座標と有限でない座標を拒否する", () => {
    for (const [x, y] of [
      [-1_000_001, 0],
      [0, 1_000_001],
      [Number.POSITIVE_INFINITY, 0],
      [0, Number.NaN],
    ]) {
      expect(
        ClientMessageSchema.safeParse({
          type: "note:publish",
          noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          x,
          y,
        }).success,
      ).toBe(false);
    }
  });

  it("note:unpublish は付箋IDを受け入れる", () => {
    expect(
      ClientMessageSchema.parse({
        type: "note:unpublish",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({
      type: "note:unpublish",
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("note:unpublish はUUIDでない付箋IDを拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "note:unpublish",
        noteId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("note:decide は付箋IDだけを受け入れる", () => {
    expect(
      ClientMessageSchema.parse({
        type: "note:decide",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toEqual({
      type: "note:decide",
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("note:decide はUUIDでない付箋IDを拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "note:decide",
        noteId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("note:decide の余剰な認可フィールドを破棄する", () => {
    expect(
      ClientMessageSchema.parse({
        type: "note:decide",
        noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        decidedBy: "attacker-id",
        phase: 99,
      }),
    ).toEqual({
      type: "note:decide",
      noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("start_phase を受け入れる", () => {
    expect(ClientMessageSchema.parse({ type: "start_phase" })).toEqual({
      type: "start_phase",
    });
  });

  it("start_phase に余計なフィールドがあっても無視する（passthrough しない）", () => {
    expect(
      ClientMessageSchema.safeParse({ type: "start_phase", phase: "phase1" })
        .success,
    ).toBe(true);
  });

  it("leave_room はクライアント送信メッセージに存在しない（REST で退出する）", () => {
    // 退出は api-worker の POST /api/rooms/:id/leave 経由で行う。WS には
    // 退出メッセージを送らない（クライアントが明示的に REST で抜ける）。
    expect(ClientMessageSchema.safeParse({ type: "leave_room" }).success).toBe(
      false,
    );
  });

  it("未知の type は拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({ type: "phase:force", phase: "phase1" })
        .success,
    ).toBe(false);
  });
});

describe("一括候補外のサーバー確定通知", () => {
  it.each([
    "note:bulk-excluded",
    "note:bulk-restored",
  ] as const)("%s はサーバー採番の operation ID と実件数を運ぶ", (type) => {
    const message = {
      type,
      operationId: "33333333-3333-4333-8333-333333333333",
      count: 2,
    };
    expect(ServerMessageSchema.parse(message)).toEqual(message);
    expect(
      ServerMessageSchema.safeParse({ ...message, count: -1 }).success,
    ).toBe(false);
  });
});

describe("parseServerMessage", () => {
  it("名前と色をサーバーが付与した cursor:updated を受け入れる", () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: "cursor:updated",
          cursor: {
            userId: USER_B,
            name: "Taro",
            color: "green",
            x: 120,
            y: 240,
            draggingNoteId: null,
          },
        }),
      ),
    ).toEqual({
      type: "cursor:updated",
      cursor: {
        userId: USER_B,
        name: "Taro",
        color: "green",
        x: 120,
        y: 240,
        draggingNoteId: null,
      },
    });
  });

  it("cursor:left は UUID の userId だけを受け入れる", () => {
    expect(
      parseServerMessage(
        JSON.stringify({ type: "cursor:left", userId: USER_B }),
      ),
    ).toEqual({ type: "cursor:left", userId: USER_B });
    expect(
      ServerMessageSchema.safeParse({
        type: "cursor:left",
        userId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("cursor:drag-ended は UUID の userId だけを受け入れる", () => {
    expect(
      parseServerMessage(
        JSON.stringify({ type: "cursor:drag-ended", userId: USER_B }),
      ),
    ).toEqual({ type: "cursor:drag-ended", userId: USER_B });
    expect(
      ServerMessageSchema.safeParse({
        type: "cursor:drag-ended",
        userId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("正常な JSON 文字列をパースしてオブジェクトを返す", () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: "snapshot",
          notes: [],
          members: [],
          phase: LOBBY,
          isHost: false,
          decision: null,
          carryovers: [],
          completedVoterIds: [],
          timer: { status: "idle" },
          serverNow: 1_700_000_000_000,
        }),
      ),
    ).toEqual({
      type: "snapshot",
      notes: [],
      members: [],
      phase: LOBBY,
      isHost: false,
      decision: null,
      carryovers: [],
      completedVoterIds: [],
      timer: { status: "idle" },
      serverNow: 1_700_000_000_000,
    });
  });

  it("JSON 以外の文字列は null", () => {
    expect(parseServerMessage("not-json")).toBeNull();
  });

  it("string 以外は null", () => {
    expect(parseServerMessage(123)).toBeNull();
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage({ type: "snapshot" })).toBeNull();
  });

  it("スキーマ違反の JSON は null（接続を落とさずエラーを返すパターンの入力層）", () => {
    expect(
      parseServerMessage(JSON.stringify({ type: "snapshot", notes: [] })),
    ).toBeNull();
  });
});

describe("parseClientMessage", () => {
  it("start_phase をパースする", () => {
    expect(parseClientMessage(JSON.stringify({ type: "start_phase" }))).toEqual(
      { type: "start_phase" },
    );
  });

  it("member_joined はクライアント送信メッセージに存在しないので拒否する", () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "member_joined",
          member: { userId: USER_A, name: "X" },
        }),
      ),
    ).toBeNull();
  });

  it("member_vote_status はクライアント送信メッセージに存在しないので拒否する", () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "member_vote_status",
          userId: USER_A,
          isComplete: true,
        }),
      ),
    ).toBeNull();
  });

  it("phase:updated はクライアント送信メッセージには存在しない", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "phase:updated", phase: "phase1" }),
      ),
    ).toBeNull();
  });

  it("不正な JSON は null", () => {
    expect(parseClientMessage("{")).toBeNull();
  });
});

// スキーマの網羅性チェック: 新しい type を追加したら上のテストにも必ず対応する
// ケースを追加する（型推論の保護とプロトコル拡張の追跡のため）。
describe("プロトコル整合性", () => {
  it("ServerMessageSchema と parseServerMessage は同じ型を返す", () => {
    const json = JSON.stringify({
      type: "member_joined",
      member: { userId: USER_A, name: "A", color: "yellow" },
    });
    const parsed = parseServerMessage(json);
    const direct = ServerMessageSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(direct);
  });
});

void USER_B;
