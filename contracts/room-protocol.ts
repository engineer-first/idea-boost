// ルーム内 WebSocket プロトコルのコントラクト。
// クライアント（lib/room-client）と RoomDO の両方がこのスキーマを import し、
// 境界を流れるメッセージはすべてここで検証される。
//
// 設計上の不変条件:
// - authorId を書き換えるメッセージは存在しない（構造的に不可能にする）。
// - roomId はプロトコルに現れない（1 RoomDO = 1 ルーム）。
// - note:drag は永続化されない一時データ。確定は note:move だけが行う。
//
// フェーズモデル:
// - lobby: 開始前ロビー（メンバー確認・招待）。
// - step: phase × step の進行状態。現在は課題整理の phase1 step1-5 のみ。
import { z } from "zod";
import { CANVAS_COORDINATE_LIMIT } from "./board";
import { RoomPhaseSchema } from "./phase";

export const NOTE_CONTENT_MAX_LENGTH = 2000;

export const DOT_VOTE_LIMITS = {
  subjective: 1,
  objective: 3,
} as const;

export const DotVoteKindSchema = z.enum(["subjective", "objective"]);
export type DotVoteKind = z.infer<typeof DotVoteKindSchema>;

const DotVoteSummarySchema = z.object({
  // 投票中は受信者向け射影で総数自体を除外する。
  count: z.number().int().min(0).optional(),
  votedByMe: z.boolean(),
  ownCount: z.number().int().min(0),
});

export const NOTE_COLOR_PALETTE = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
  "red",
  "lime",
  "teal",
  "cyan",
  "indigo",
  "violet",
  "fuchsia",
  "rose",
  "amber",
  "emerald",
  "sky",
  "slate",
  "stone",
  "zinc",
] as const;

export const NoteColorSchema = z.enum(NOTE_COLOR_PALETTE);
export type NoteColor = z.infer<typeof NoteColorSchema>;

export const CanvasCoordinateSchema = z
  .number()
  .finite()
  .min(-CANVAS_COORDINATE_LIMIT)
  .max(CANVAS_COORDINATE_LIMIT);

export const NoteSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string(),
  visibility: z.enum(["private", "shared"]),
  color: NoteColorSchema,
  x: CanvasCoordinateSchema,
  y: CanvasCoordinateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  dotVotes: z.object({
    subjective: DotVoteSummarySchema,
    objective: DotVoteSummarySchema,
  }),
});

export type ProtocolNote = z.infer<typeof NoteSchema>;

export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(50, "グループ名は50文字以内で入力してください。"),
  noteIds: z.array(z.string().uuid()).min(2),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProtocolGroup = z.infer<typeof GroupSchema>;

export const TIMER_MAX_DURATION_MS = 5_999_000;
const TimerMillisecondsSchema = z.number().int().finite().min(0);
const TimerDurationSchema = TimerMillisecondsSchema.max(TIMER_MAX_DURATION_MS);

export const TimerStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  z.object({
    status: z.literal("running"),
    endsAt: TimerMillisecondsSchema,
    durationMs: TimerDurationSchema,
  }),
  z.object({
    status: z.literal("paused"),
    remainingMs: TimerDurationSchema,
    durationMs: TimerDurationSchema,
  }),
]);
export type TimerState = z.infer<typeof TimerStateSchema>;

// メンバー一覧スナップショットの単位。
export const MemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  color: NoteColorSchema,
});
export type ProtocolMember = z.infer<typeof MemberSchema>;

export const DecisionSchema = z.object({
  phase: z.number().int().min(1).max(3),
  noteId: z.string().uuid(),
  decidedBy: z.string().uuid(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// フェーズをまたいで引き継ぐ確定情報（前フェーズで決定された付箋）。
// content は決定時点のコピーで、元付箋の後からの編集・削除に影響されない。
// フェーズ2の「決定した課題」表示が最初の利用者で、フェーズ3の決定 HMW
// 表示でも同じ形を再利用する。
export const CarryoverSchema = z.object({
  phase: z.number().int().min(1).max(3),
  noteId: z.string().uuid(),
  // サーバーが note.content（入力時に上限検証済み）をコピーする値だが、
  // コントラクト単体でも他スキーマと同じ上限で有界にしておく。
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH),
});
export type Carryover = z.infer<typeof CarryoverSchema>;

const NotePositionSchema = {
  x: CanvasCoordinateSchema,
  y: CanvasCoordinateSchema,
};

// ---------------------------------------------------------------
// クライアント → サーバー
// ---------------------------------------------------------------

export const ClientMessageSchema = z.discriminatedUnion("type", [
  // content はテンプレート・具体例を起点にしたプリフィル付き作成用。
  // プロトコルに作成応答の相関 ID がないため、「作成してから内容を送る」
  // 2 段階ではなく作成時に内容を渡せる形にしている。
  z.object({
    type: z.literal("note:create"),
    content: z
      .string()
      .max(NOTE_CONTENT_MAX_LENGTH, "本文は2000文字以内で入力してください。")
      .optional(),
  }),
  z.object({
    type: z.literal("note:publish"),
    noteId: z.string().uuid(),
    ...NotePositionSchema,
  }),
  z.object({
    type: z.literal("note:unpublish"),
    noteId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("note:update-content"),
    noteId: z.string().uuid(),
    content: z
      .string()
      .max(NOTE_CONTENT_MAX_LENGTH, "本文は2000文字以内で入力してください。"),
  }),
  z.object({
    type: z.literal("note:move"),
    noteId: z.string().uuid(),
    ...NotePositionSchema,
  }),
  z.object({
    type: z.literal("note:drag"),
    noteId: z.string().uuid(),
    ...NotePositionSchema,
  }),
  z.object({
    type: z.literal("note:delete"),
    noteId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("group:create"),
    group: GroupSchema,
  }),
  z.object({
    type: z.literal("group:update-name"),
    groupId: z.string().uuid(),
    name: z.string().max(50, "グループ名は50文字以内で入力してください。"),
  }),
  z.object({
    type: z.literal("note:vote"),
    noteId: z.string().uuid(),
    kind: DotVoteKindSchema,
  }),
  z.object({
    type: z.literal("note:vote-reset"),
    noteId: z.string().uuid(),
    kind: DotVoteKindSchema,
  }),
  z.object({
    type: z.literal("note:decide"),
    noteId: z.string().uuid(),
  }),
  // ロビーから課題整理 Step 1-1 へ。ホストのみ。
  z.object({ type: z.literal("start_phase") }),
  // 課題整理の次ステップへ。ホストのみ。
  // force はフェーズ1・2の投票ステップの全員投票ゲートを迂回する脱出ハッチ（離脱者がいても
  // ホストが進行できる）。ホスト判定が先に評価されるため、非ホストが
  // force を送っても効果はない。
  z.object({
    type: z.literal("phase:next"),
    force: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("timer:start"),
    durationMs: z.number().int().min(1).max(TIMER_MAX_DURATION_MS),
  }),
  z.object({ type: z.literal("timer:pause") }),
  z.object({ type: z.literal("timer:resume") }),
  z.object({ type: z.literal("timer:extend") }),
  z.object({ type: z.literal("timer:stop") }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------
// サーバー → クライアント
// ---------------------------------------------------------------

export const WS_CLOSE_LEFT_ROOM = 4000;
export const WS_CLOSE_LEFT_ROOM_REASON = "left the room";
export const WS_CLOSE_ROOM_DISBANDED = 4001;
export const WS_CLOSE_ROOM_DISBANDED_REASON = "room disbanded";

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    notes: z.array(NoteSchema),
    groups: z.array(GroupSchema).optional(),
    members: z.array(MemberSchema),
    phase: RoomPhaseSchema,
    isHost: z.boolean(),
    decision: DecisionSchema.nullable(),
    // 現在フェーズより前のフェーズで確定した決定の一覧（フェーズ昇順）。
    carryovers: z.array(CarryoverSchema),
    timer: TimerStateSchema,
    serverNow: TimerMillisecondsSchema,
  }),
  z.object({ type: z.literal("note:inserted"), note: NoteSchema }),
  z.object({ type: z.literal("note:updated"), note: NoteSchema }),
  z.object({ type: z.literal("note:deleted"), noteId: z.string().uuid() }),
  z.object({
    type: z.literal("note:drag"),
    noteId: z.string().uuid(),
    x: CanvasCoordinateSchema,
    y: CanvasCoordinateSchema,
  }),
  z.object({
    type: z.literal("group:updated"),
    group: GroupSchema,
  }),
  z.object({
    type: z.literal("group:deleted"),
    groupId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("member_joined"),
    member: MemberSchema,
  }),
  z.object({
    type: z.literal("member_left"),
    userId: z.string().uuid(),
  }),
  // start_phase 成功時（ロビー離脱）にも phase:next 成功時にも使う。
  z.object({
    type: z.literal("phase:updated"),
    phase: RoomPhaseSchema,
  }),
  z.object({ type: z.literal("decision:updated"), ...DecisionSchema.shape }),
  z.object({
    type: z.literal("timer:updated"),
    timer: TimerStateSchema,
    serverNow: TimerMillisecondsSchema,
  }),
  z.object({
    type: z.literal("error"),
    // voting-incomplete: Step 1-4 の全員投票ゲートによる phase:next 拒否。
    // クライアントがホストへ「強制的に進むか」の確認を出す判別に使う。
    code: z.enum([
      "invalid-message",
      "forbidden",
      "not-found",
      "voting-incomplete",
    ]),
    message: z.string(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = ServerMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
