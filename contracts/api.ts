// api-worker の REST 境界スキーマ。Next の Server Actions（クライアント側）と
// api-worker（サーバー側）の両方が参照するコントラクト層。
import { z } from "zod";
import { RoomPhaseSchema } from "./phase";
import {
  CreationRequestIdSchema,
  ROOM_CREATION_NAME_MAX,
} from "./room-creation";
import { NoteColorSchema } from "./room-protocol";

export const SyncUserResponseSchema = z.object({
  userId: z.string().uuid(),
});

// 作成・再送の結果。現在の進行状態は既存のルーム情報取得で確認する。
export const RoomSummarySchema = z.object({
  roomId: z.string().uuid(),
  inviteCode: z.string(),
});

export const CreateRoomResponseSchema = RoomSummarySchema;

export const CreateRoomInputSchema = z
  .object({
    requestId: CreationRequestIdSchema,
    expectedPrincipal: z.string().uuid(),
    name: z.string().trim().max(ROOM_CREATION_NAME_MAX).optional(),
  })
  .strict();

export const JoinRoomResponseSchema = z.object({
  roomId: z.string().uuid(),
});

// ルーム情報取得のレスポンス。isHost / hostUserId / phase はこのエンドポイント
// でのみ返す（メンバー限定。非メンバーには 404 で存在も漏らさない）。
// - isHost: クライアントが「開始」ボタンの表示を制御するために必要。
// - hostUserId: メンバー一覧で「誰がホストか」を名前下に表示するために必要。
//   既にメンバーだけが userId 一覧を見られる前提なので、ホストの userId を
//   メンバーに返すことは追加の存在漏洩にならない。
// - phase: 現在の進行状態。start_phase の二重防御用に進行状態を観測可能にする。
export const RoomInfoResponseSchema = RoomSummarySchema.extend({
  isHost: z.boolean(),
  hostUserId: z.string().uuid(),
  phase: RoomPhaseSchema,
  name: z.string().nullable().optional(),
  displayId: z.string().optional(),
});

// メンバー一覧のレスポンス。SSR で初期表示を組み立てるために使う。
// Realtime での member_joined は WS 側で別途配信する。
export const RoomMemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  color: NoteColorSchema,
});
export const RoomMembersResponseSchema = z.object({
  members: z.array(RoomMemberSchema),
});

// GET /api/rooms/lookup?code= のレスポンス。招待確認 Dialog のホスト名表示用。
export const RoomLookupResponseSchema = z.object({
  roomId: z.string().uuid(),
  inviteCode: z.string(),
  hostName: z.string(),
});

// 復帰確認の結果だけを返す。認可済み情報や盤面は既存APIに留める。
export const ReturnToRoomResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), href: z.string() }),
  z.object({ kind: z.literal("unavailable_room") }),
  z.object({ kind: z.literal("retry") }),
]);
export type ReturnToRoomResult = z.infer<typeof ReturnToRoomResultSchema>;
