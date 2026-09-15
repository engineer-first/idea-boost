// api-worker の REST 境界スキーマ。Next の Server Actions（クライアント側）と
// api-worker（サーバー側）の両方が参照するコントラクト層。
import { z } from "zod";
import { RoomPhaseSchema } from "./phase";
import { NoteColorSchema } from "./room-protocol";

export const SyncUserResponseSchema = z.object({
  userId: z.string().uuid(),
});

// ルーム作成直後のレスポンス。最小限の形を維持し、進行状態などの派生情報は
// ルーム情報取得 (/api/rooms/[id]) 側にだけ載せる（作成直後は lobby 確定で
// 十分なので追加しない）。
export const RoomSummarySchema = z.object({
  roomId: z.string().uuid(),
  inviteCode: z.string(),
});

export const CreateRoomResponseSchema = RoomSummarySchema;

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
