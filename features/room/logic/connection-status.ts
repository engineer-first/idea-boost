// ルーム内画面（ロビー / ボード）が表示に使う接続状態。
// lib/room-client の RoomConnectionStatus から「画面遷移で消費される終端状態
// （ended / disbanded）」を除いたもの。終端状態は useRoomConnection が
// ホーム遷移へ変換するため、view には届かない。
import type { RoomConnectionStatus } from "@/lib/room-client/room-client";

export type RoomScreenConnectionStatus =
  | Exclude<RoomConnectionStatus, "ended" | "disbanded">
  | "auth-required"
  | "unavailable";
