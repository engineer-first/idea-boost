// ルーム内 WebSocket プロトコルのコントラクト。
// クライアント（lib/room-client）と RoomDO の両方がこのスキーマを import し、
// 境界を流れるメッセージはすべてここで検証される。
//
// 設計上の不変条件:
// - authorId を書き換えるメッセージは存在しない（構造的に不可能にする）。
// - roomId はプロトコルに現れない（1 RoomDO = 1 ルーム）。
// - 共有付箋のドラッグは UUID の dragId で相関し、RoomDO が排他所有する。
//
// フェーズモデル:
// - lobby: 開始前ロビー（メンバー確認・招待）。
// - step: phase × step の進行状態。現在は課題整理の phase1 step1-5 のみ。
import { z } from "zod";
import {
  CANVAS_COORDINATE_LIMIT,
  IDEA_MAP_SIZE_LEVEL_RANGE,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_SIZE_RANGE,
} from "./board";
import { UUID_PATTERN } from "./ids";
import { RoomPhaseSchema } from "./phase";

// 既存 ID の受理範囲を Zod のバージョンに依存させない。
const HostUserIdSchema = z.string().regex(UUID_PATTERN);

export const NOTE_CONTENT_MAX_LENGTH = 2000;

export const IdeaMapSizeLevelSchema = z
  .number()
  .int()
  .min(IDEA_MAP_SIZE_LEVEL_RANGE.min)
  .max(IDEA_MAP_SIZE_LEVEL_RANGE.max);
export type IdeaMapSizeLevel = z.infer<typeof IdeaMapSizeLevelSchema>;

export const DOT_VOTE_LIMITS = {
  subjective: 1,
  objective: 3,
} as const;

export const DotVoteKindSchema = z.enum(["subjective", "objective"]);
export type DotVoteKind = z.infer<typeof DotVoteKindSchema>;

// 楽観表示した操作と、RoomDO から返る確定・拒否応答を対応付けるID。
// 旧クライアントとの段階的な入れ替えを許すため、ワイヤ上では省略も受け入れる。
export const OptimisticOperationIdSchema = z.guid();
export const VoteOperationIdSchema = OptimisticOperationIdSchema;
export const BulkExclusionOperationIdSchema = z.guid();
export type BulkExclusionOperationId = z.infer<
  typeof BulkExclusionOperationIdSchema
>;

// シールは付箋内の相対座標で保存する。画面のズームや付箋サイズが変わっても
// 同じ位置に復元でき、クライアントがボード座標を推測する必要もない。
export const VoteStickerCoordinateSchema = z.number().finite().min(0).max(1);

export const DotVoteStickerSchema = z.object({
  id: z.guid(),
  kind: DotVoteKindSchema,
  x: VoteStickerCoordinateSchema,
  y: VoteStickerCoordinateSchema,
});
export type DotVoteSticker = z.infer<typeof DotVoteStickerSchema>;

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

// 新規メンバーへ割り当てる色の優先順。色IDの保存・通信上の集合とは分けて管理し、
// 既存の割り当て履歴を変えずに、少人数で異なる色系統を先に使う。
export const MEMBER_COLOR_ASSIGNMENT_ORDER = [
  "yellow",
  "blue",
  "pink",
  "green",
  "purple",
  "orange",
  "teal",
  "red",
  "indigo",
  "lime",
  "fuchsia",
  "cyan",
  "amber",
  "emerald",
  "violet",
  "rose",
  "sky",
  "stone",
  "slate",
  "zinc",
] as const satisfies readonly NoteColor[];

export const CanvasCoordinateSchema = z
  .number()
  .finite()
  .min(-CANVAS_COORDINATE_LIMIT)
  .max(CANVAS_COORDINATE_LIMIT);

export const NoteFontSizeSchema = z
  .number()
  .int()
  .min(NOTE_FONT_SIZE_RANGE.min)
  .max(NOTE_FONT_SIZE_RANGE.max);

export const NoteSchema = z.object({
  id: z.guid(),
  authorId: z.guid(),
  content: z.string(),
  contentRevision: z.number().int().nonnegative(),
  visibility: z.enum(["private", "shared"]),
  color: NoteColorSchema,
  // 旧 Worker / 保存データにフィールドがなくても従来相当の14pxで復元する。
  fontSize: NoteFontSizeSchema.default(NOTE_DEFAULT_FONT_SIZE),
  x: CanvasCoordinateSchema,
  y: CanvasCoordinateSchema,
  // 決定ステップで一時的に候補から外す状態。削除とは異なり、付箋の内容・
  // 票・グループ・座標はそのまま保持する。
  excluded: z.boolean().default(false),
  exclusionOperationId: z.guid().nullable().optional(),
  stackOrder: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dotVotes: z.object({
    subjective: DotVoteSummarySchema,
    objective: DotVoteSummarySchema,
  }),
  // 投票中は受信者本人のシールだけ、結果ステップでは全シールを返す。
  // 票数を使う従来の結果UIは dotVotes を引き続き読む。
  dotVoteStickers: z.array(DotVoteStickerSchema).default([]),
});

export type ProtocolNote = z.infer<typeof NoteSchema>;

export const GroupSchema = z.object({
  id: z.guid(),
  name: z.string().max(50, "グループ名は50文字以内で入力してください。"),
  noteIds: z.array(z.guid()).min(2),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProtocolGroup = z.infer<typeof GroupSchema>;

export const GroupBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();

export const GroupDragFrameSchema = GroupBoundsSchema.extend({
  id: z.string(),
  // 結合した表示枠の名前は複数の保存グループ名を連結する。
  name: z.string(),
  isTemp: z.boolean().optional(),
  persistentGroupId: z.guid().optional(),
  representativeNoteId: z.guid(),
  hue: z.number().finite().optional(),
});
export type GroupDragFrame = z.infer<typeof GroupDragFrameSchema>;

const GroupDragPositionSchema = z
  .object({
    noteId: z.guid(),
    x: CanvasCoordinateSchema,
    y: CanvasCoordinateSchema,
  })
  .strict();
const GroupDragDeltaSchema = z
  .object({
    x: z
      .number()
      .finite()
      .min(-2 * CANVAS_COORDINATE_LIMIT)
      .max(2 * CANVAS_COORDINATE_LIMIT),
    y: z
      .number()
      .finite()
      .min(-2 * CANVAS_COORDINATE_LIMIT)
      .max(2 * CANVAS_COORDINATE_LIMIT),
  })
  .strict();
const GroupDragSequenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

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
  z
    .object({
      // 手動終了・時間切れ後も参加者全員が同じ 00:00 と再設定導線を見る。
      status: z.literal("ended"),
      durationMs: TimerDurationSchema,
    })
    .strict(),
]);
export type TimerState = z.infer<typeof TimerStateSchema>;

// メンバー一覧スナップショットの単位。
export const MemberSchema = z.object({
  userId: z.guid(),
  name: z.string(),
  color: NoteColorSchema,
});
export type ProtocolMember = z.infer<typeof MemberSchema>;

// 共有順・発表進捗は全員共有。付箋や非公開の作業情報は含めない。
export const SharingStateSchema = z.object({
  revision: z.guid(),
  order: z.array(MemberSchema),
  status: z.enum(["inactive", "ready", "active", "complete"]),
  currentIndex: z.number().int().nonnegative().nullable(),
  results: z.array(z.enum(["done", "passed"])),
  durationMs: z.number().int().min(1).max(TIMER_MAX_DURATION_MS),
  startsAt: TimerMillisecondsSchema.nullable(),
});
export type SharingState = z.infer<typeof SharingStateSchema>;

// カーソルは RoomDO が永続化しない presence。クライアント入力には userId / name /
// color を持たせず、認証済みソケットと members からサーバーが付与する。
export const CursorPresenceSchema = z.object({
  userId: z.guid(),
  name: z.string(),
  color: NoteColorSchema,
  x: CanvasCoordinateSchema,
  y: CanvasCoordinateSchema,
  draggingNoteId: z.guid().nullable(),
});
export type CursorPresence = z.infer<typeof CursorPresenceSchema>;

export const DecisionSchema = z.object({
  phase: z.number().int().min(1).max(3),
  noteId: z.guid(),
  decidedBy: z.guid(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// フェーズをまたいで引き継ぐ確定情報（前フェーズで決定された付箋）。
// content は決定時点のコピーで、元付箋の後からの編集・削除に影響されない。
// フェーズ2の「決定した課題」表示が最初の利用者で、フェーズ3の決定した問い
// 表示でも同じ形を再利用する。
export const CarryoverSchema = z.object({
  phase: z.number().int().min(1).max(3),
  noteId: z.guid(),
  // サーバーが note.content（入力時に上限検証済み）をコピーする値だが、
  // コントラクト単体でも他スキーマと同じ上限で有界にしておく。
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH),
});
export type Carryover = z.infer<typeof CarryoverSchema>;

const NotePositionSchema = {
  x: CanvasCoordinateSchema,
  y: CanvasCoordinateSchema,
};

export const NoteDragIdSchema = z.guid();

// ---------------------------------------------------------------
// クライアント → サーバー
// ---------------------------------------------------------------

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("sharing:start"),
      revision: z.guid(),
      durationMs: z.number().int().min(1).max(TIMER_MAX_DURATION_MS),
    })
    .strict(),
  z
    .object({
      type: z.literal("sharing:advance"),
      revision: z.guid(),
      outcome: z.enum(["done", "passed"]),
    })
    .strict(),
  z.object({
    type: z.literal("cursor:update"),
    // マップ表示中は左下原点の百分率。余白は0〜100の外も許可し、
    // 付箋の評価位置とは別にCanvasCoordinateSchemaの安全上限を守る。
    ...NotePositionSchema,
    // null はドラッグ終了後もカーソル自体は表示し続けることを明示する。
    draggingNoteId: z.guid().nullable().optional(),
  }),
  z.object({ type: z.literal("cursor:leave") }),
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
    noteId: z.guid(),
    ...NotePositionSchema,
  }),
  z.object({
    type: z.literal("note:unpublish"),
    noteId: z.guid(),
    privateIndex: z.number().int().nonnegative().optional(),
  }),
  z
    .object({
      type: z.literal("note:update-content"),
      noteId: z.guid(),
      content: z
        .string()
        .max(NOTE_CONTENT_MAX_LENGTH, "本文は2000文字以内で入力してください。"),
      operationId: OptimisticOperationIdSchema,
      expectedContentRevision: z.number().int().nonnegative(),
      expectedPhaseRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("note:content-status"),
      operationId: OptimisticOperationIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("note:update-font-size"),
      noteId: z.guid(),
      fontSize: NoteFontSizeSchema,
      operationId: OptimisticOperationIdSchema.optional(),
    })
    .strict(),
  z.object({
    type: z.literal("note:move"),
    noteId: z.guid(),
    ...NotePositionSchema,
  }),
  z
    .object({
      type: z.literal("note:bring-to-front"),
      noteId: z.guid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("note:drag:start"),
      noteId: z.guid(),
      dragId: NoteDragIdSchema,
    })
    .strict(),
  z.object({
    type: z.literal("note:drag:move"),
    noteId: z.guid(),
    dragId: NoteDragIdSchema,
    ...NotePositionSchema,
  }),
  z.object({
    type: z.literal("note:drag:end"),
    noteId: z.guid(),
    dragId: NoteDragIdSchema,
    // null は pointer cancel。最後にサーバーが受理した座標を維持する。
    position: z.object(NotePositionSchema).nullable(),
  }),
  z.object({
    type: z.literal("note:exclude"),
    noteId: z.guid(),
    operationId: OptimisticOperationIdSchema.optional(),
  }),
  z.object({
    type: z.literal("note:restore"),
    noteId: z.guid(),
    operationId: OptimisticOperationIdSchema.optional(),
    expectedExclusionOperationId: z.guid().optional(),
  }),
  // 対象は実行時のサーバー状態から再判定するため、クライアントは件数や
  // note ID 群を送らない。
  z.object({
    type: z.literal("note:bulk-exclude"),
    operationId: OptimisticOperationIdSchema.optional(),
  }),
  z.object({
    type: z.literal("note:bulk-restore"),
    operationId: BulkExclusionOperationIdSchema,
  }),
  z.object({
    type: z.literal("note:delete"),
    noteId: z.guid(),
  }),
  z.object({
    type: z.literal("group:create"),
    group: GroupSchema,
  }),
  z.object({
    type: z.literal("group:update-name"),
    groupId: z.guid(),
    name: z.string().max(50, "グループ名は50文字以内で入力してください。"),
  }),
  z
    .object({
      type: z.literal("group:drag:start"),
      dragId: NoteDragIdSchema,
      anchorNoteId: z.guid(),
      bounds: GroupBoundsSchema,
      positions: z.array(GroupDragPositionSchema).min(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("group:drag:move"),
      dragId: NoteDragIdSchema,
      sequence: GroupDragSequenceSchema,
      delta: GroupDragDeltaSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("group:drag:end"),
      dragId: NoteDragIdSchema,
      sequence: GroupDragSequenceSchema,
      delta: GroupDragDeltaSchema.nullable(),
    })
    .strict(),
  z.object({
    type: z.literal("note:vote"),
    noteId: z.guid(),
    kind: DotVoteKindSchema,
    operationId: VoteOperationIdSchema.optional(),
  }),
  z.object({
    type: z.literal("note:vote-reset"),
    noteId: z.guid(),
    kind: DotVoteKindSchema,
    operationId: VoteOperationIdSchema.optional(),
  }),
  // 付箋に積んだ自分の票を1票だけ取り消す。客観票の一部を別の付箋へ
  // 付け替えられるよう、従来の全消去（note:vote-reset）とは分ける。
  z.object({
    type: z.literal("note:vote-remove"),
    noteId: z.guid(),
    kind: DotVoteKindSchema,
    operationId: VoteOperationIdSchema.optional(),
  }),
  // パレットから付箋へシールをドロップして投票する。stickerId はクライアントが
  // UUID で生成する表示用IDであり、authorId / roomId は含めない。
  z.object({
    type: z.literal("note:vote-sticker:add"),
    noteId: z.guid(),
    stickerId: z.guid(),
    kind: DotVoteKindSchema,
    x: VoteStickerCoordinateSchema,
    y: VoteStickerCoordinateSchema,
    operationId: VoteOperationIdSchema.optional(),
  }),
  // 自分のシールだけを別の付箋・付箋内の位置へ移せる。付け替え中も票数は
  // 変えないため、上限の再消費や他者の票への干渉を構造的に避けられる。
  z.object({
    type: z.literal("note:vote-sticker:move"),
    noteId: z.guid(),
    stickerId: z.guid(),
    x: VoteStickerCoordinateSchema,
    y: VoteStickerCoordinateSchema,
    operationId: VoteOperationIdSchema.optional(),
  }),
  z.object({
    type: z.literal("note:vote-sticker:remove"),
    stickerId: z.guid(),
    operationId: VoteOperationIdSchema.optional(),
  }),
  z.object({
    type: z.literal("note:decide"),
    noteId: z.guid(),
  }),
  // 最終案の採用とは別に、ホストが成果画面を全員へ公開する。
  z.object({ type: z.literal("outcome:publish") }),
  // 画面で確認した決定だけを取り消す。古いタブの要求で別の決定を消さない。
  // フェーズと権限は送らせず、RoomDO の現在状態から検証する。
  z.object({ type: z.literal("decision:clear"), noteId: z.guid() }),
  // 採用選択モード中にホストが現在検討している候補。userId / phase は
  // 認証済みソケットと RoomDO の権威状態から導出する。
  z.object({
    type: z.literal("adoption-focus:update"),
    noteId: z.guid().nullable(),
  }),
  // ロビーから課題整理 Step 1-1 へ。ホストのみ。
  z.object({
    type: z.literal("start_phase"),
    expectedHostRevision: z.number().int().nonnegative().optional(),
  }),
  z
    .object({
      type: z.literal("host:transfer"),
      targetUserId: HostUserIdSchema,
      expectedHostRevision: z.number().int().nonnegative(),
    })
    .strict(),
  // 課題整理の次ステップへ。ホストのみ。
  // force は全フェーズの投票ステップの全員投票ゲートを迂回する脱出ハッチ（離脱者がいても
  // ホストが進行できる）。ホスト判定が先に評価されるため、非ホストが
  // force を送っても効果はない。
  z.object({
    type: z.literal("phase:next"),
    expectedPhase: RoomPhaseSchema,
    expectedRevision: z.number().int().nonnegative(),
    force: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("phase:restart-writing"),
    expectedPhase: RoomPhaseSchema,
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("phase:revote"),
    expectedPhase: RoomPhaseSchema,
    expectedRevision: z.number().int().nonnegative(),
  }),
  z
    .object({
      type: z.literal("idea-map:resize"),
      sizeLevel: IdeaMapSizeLevelSchema,
    })
    .strict(),
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

export const PendingPhaseTransitionSchema = z.object({
  transitionId: z.guid(),
  expectedPhase: RoomPhaseSchema,
  expectedRevision: z.number().int().nonnegative(),
  deadlineAt: TimerMillisecondsSchema,
  serverNow: TimerMillisecondsSchema,
});
export type PendingPhaseTransition = z.infer<
  typeof PendingPhaseTransitionSchema
>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("host:updated"),
    hostUserId: HostUserIdSchema,
    hostRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("sharing:updated"),
    sharing: SharingStateSchema,
    timer: TimerStateSchema,
    serverNow: TimerMillisecondsSchema,
  }),
  z.object({
    type: z.literal("snapshot"),
    sharing: SharingStateSchema.nullable().optional(),
    notes: z.array(NoteSchema),
    groups: z.array(GroupSchema).optional(),
    groupDrags: z
      .array(
        z
          .object({
            dragId: NoteDragIdSchema,
            sequence: GroupDragSequenceSchema,
            group: GroupDragFrameSchema,
            noteIds: z.array(z.guid()).min(2),
          })
          .strict(),
      )
      .optional(),
    members: z.array(MemberSchema),
    phase: RoomPhaseSchema,
    phaseRevision: z.number().int().nonnegative().default(0),
    pendingPhaseTransition: PendingPhaseTransitionSchema.nullable().optional(),
    isHost: z.boolean(),
    hostUserId: HostUserIdSchema.nullable().optional(),
    hostRevision: z.number().int().nonnegative().optional(),
    decision: DecisionSchema.nullable(),
    outcomePublished: z.boolean().optional(),
    // 永続化しない一時状態。再接続直後にも現在の共有フォーカスを復元する。
    adoptionFocusNoteId: z.guid().nullable().optional(),
    // 個人付箋の本文・作者別枚数は含めず、マップの共有状態だけを復元する。
    ideaMapSizeLevel: IdeaMapSizeLevelSchema.optional(),
    ideaMapSizeInitialized: z.boolean().optional(),
    ideaMapDragging: z.boolean().optional(),
    // 現在フェーズより前のフェーズで確定した決定の一覧（フェーズ昇順）。
    carryovers: z.array(CarryoverSchema),
    // 投票中に全票を使い切ったメンバーの userId だけを共有する。
    // 投票先・票種別ごとの残数・カーソル位置は含めない。
    completedVoterIds: z.array(z.guid()),
    timer: TimerStateSchema,
    serverNow: TimerMillisecondsSchema,
  }),
  z.object({ type: z.literal("note:inserted"), note: NoteSchema }),
  z
    .object({
      type: z.literal("note:content-saved"),
      operationId: OptimisticOperationIdSchema,
      noteId: z.guid(),
      contentRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("note:content-status-result"),
      operationId: OptimisticOperationIdSchema,
      status: z.enum(["accepted", "unknown"]),
      noteId: z.guid().optional(),
      contentRevision: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({
    type: z.literal("note:updated"),
    note: NoteSchema,
    operationId: OptimisticOperationIdSchema.optional(),
  }),
  z.object({ type: z.literal("note:deleted"), noteId: z.guid() }),
  z.object({
    type: z.literal("note:bulk-excluded"),
    operationId: BulkExclusionOperationIdSchema,
    count: z.number().int().nonnegative(),
    // 段階デプロイ中に旧 Worker の手動確定通知も受け取れるよう、
    // source がない既存形式は manual として補完する。
    source: z.enum(["manual", "phase-transition"]).default("manual"),
  }),
  z.object({
    type: z.literal("note:bulk-restored"),
    operationId: BulkExclusionOperationIdSchema,
    count: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("note:drag:result"),
    dragId: NoteDragIdSchema,
    accepted: z.boolean(),
  }),
  z.object({
    type: z.literal("group:updated"),
    group: GroupSchema,
  }),
  z.object({
    type: z.literal("group:drag:result"),
    dragId: NoteDragIdSchema,
    accepted: z.boolean(),
  }),
  z.object({
    type: z.literal("group:drag:updated"),
    dragId: NoteDragIdSchema,
    sequence: GroupDragSequenceSchema,
    group: GroupDragFrameSchema,
    // 開始・終了は完全な付箋、途中は保存済み座標だけを配信する。
    notes: z.union([
      z.array(NoteSchema).min(2),
      z
        .array(
          NoteSchema.pick({
            id: true,
            x: true,
            y: true,
            updatedAt: true,
          }).strict(),
        )
        .min(2),
    ]),
    ended: z.boolean(),
  }),
  z.object({
    type: z.literal("group:deleted"),
    groupId: z.guid(),
  }),
  z.object({
    type: z.literal("member_joined"),
    member: MemberSchema,
  }),
  z.object({
    type: z.literal("member_left"),
    userId: z.guid(),
  }),
  z
    .object({
      type: z.literal("member_vote_status"),
      userId: z.guid(),
      isComplete: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("cursor:updated"), cursor: CursorPresenceSchema }),
  z.object({
    type: z.literal("cursor:drag-ended"),
    userId: z.guid(),
  }),
  z.object({ type: z.literal("cursor:left"), userId: z.guid() }),
  // start_phase 成功時（ロビー離脱）にも phase:next 成功時にも使う。
  z.object({
    type: z.literal("phase:updated"),
    phase: RoomPhaseSchema,
    phaseRevision: z.number().int().nonnegative().default(0),
  }),
  z
    .object({
      type: z.literal("phase:save-requested"),
      ...PendingPhaseTransitionSchema.shape,
    })
    .strict(),
  z.object({
    type: z.literal("decision:updated"),
    decision: DecisionSchema.nullable(),
  }),
  z.object({
    type: z.literal("outcome:published"),
    published: z.literal(true),
  }),
  z.object({
    type: z.literal("adoption-focus:updated"),
    noteId: z.guid().nullable(),
  }),
  z
    .object({
      type: z.literal("idea-map:state"),
      sizeLevel: IdeaMapSizeLevelSchema,
      initialized: z.boolean(),
      isDragging: z.boolean(),
    })
    .strict(),
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
      "content-conflict",
    ]),
    message: z.string(),
    // 楽観操作に起因する拒否だけが持つ。汎用エラーは省略する。
    operationId: OptimisticOperationIdSchema.optional(),
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
