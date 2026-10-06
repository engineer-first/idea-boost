import type { z } from "zod";
import { CreateRoomInputSchema } from "@/contracts/api";

export type RoomCreationIntent = z.infer<typeof CreateRoomInputSchema>;
export const ROOM_CREATION_STORAGE_PREFIX = "idea-boost:room-creation:";

export function readRoomCreationIntent(
  userId: string,
): RoomCreationIntent | null {
  const value = sessionStorage.getItem(ROOM_CREATION_STORAGE_PREFIX + userId);
  if (!value) return null;
  const parsed = CreateRoomInputSchema.safeParse(JSON.parse(value));
  // 壊れた記録を新規要求で上書きすると重複作成に繋がるためfail closed。
  if (!parsed.success) throw new Error("作成要求の記録を読み取れません。");
  return parsed.data;
}
export function saveRoomCreationIntent(
  userId: string,
  intent: RoomCreationIntent,
): void {
  sessionStorage.setItem(
    ROOM_CREATION_STORAGE_PREFIX + userId,
    JSON.stringify(CreateRoomInputSchema.parse(intent)),
  );
}
export function clearRoomCreationIntent(userId: string): void {
  sessionStorage.removeItem(ROOM_CREATION_STORAGE_PREFIX + userId);
}
