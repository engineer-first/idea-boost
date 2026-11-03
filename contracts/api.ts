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
  userId: z.guid(),
});

// 作成・再送の結果。現在の進行状態は既存のルーム情報取得で確認する。
export const RoomSummarySchema = z.object({
  roomId: z.guid(),
  inviteCode: z.string(),
});

export const CreateRoomResponseSchema = RoomSummarySchema;

export const CreateRoomInputSchema = z.strictObject({
  requestId: CreationRequestIdSchema,
  expectedPrincipal: z.guid(),
  name: z.string().trim().max(ROOM_CREATION_NAME_MAX).optional(),
});

export const JoinRoomResponseSchema = z.object({
  roomId: z.guid(),
});

// 在籍者だけに現在の進行状態を返す。非在籍者には存在を公開しない。
export const RoomInfoResponseSchema = RoomSummarySchema.extend({
  phase: RoomPhaseSchema,
  name: z.string().nullable().optional(),
  displayId: z.string().optional(),
});

// メンバー一覧のレスポンス。SSR で初期表示を組み立てるために使う。
// Realtime での member_joined は WS 側で別途配信する。
export const RoomMemberSchema = z.object({
  userId: z.guid(),
  name: z.string(),
  color: NoteColorSchema,
});
export const RoomMembersResponseSchema = z.object({
  members: z.array(RoomMemberSchema),
});

// GET /api/rooms/lookup?code= のレスポンス。招待確認 Dialog のホスト名表示用。
export const RoomLookupResponseSchema = z.object({
  roomId: z.guid(),
  inviteCode: z.string(),
  hostName: z.string(),
});

// 410で返す照会失敗。終了状態だけを知らせ、ルームや招待の情報は含めない。
export const RoomLookupFailureSchema = z.object({
  reason: z.literal("ended"),
  error: z.string(),
});

// 復帰確認の結果だけを返す。認可済み情報や盤面は既存APIに留める。
export const ReturnToRoomResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    href: z.string(),
    entryToken: z.string().optional(),
  }),
  z.object({ kind: z.literal("unavailable_room") }),
  z.object({ kind: z.literal("retry") }),
  z.object({ kind: z.literal("reauth_required") }),
  z.object({ kind: z.literal("identity_unavailable") }),
]);
export type ReturnToRoomResult = z.infer<typeof ReturnToRoomResultSchema>;
