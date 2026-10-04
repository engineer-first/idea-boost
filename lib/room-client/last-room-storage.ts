// ブラウザに保持する入口候補。参加・閲覧の認可には使わない。本文は保存しない。
import { z } from "zod";

export const LAST_ROOM_STORAGE_KEY = "idea-boost:last-room";
const CandidateSchema = z
  .object({ userId: z.string().uuid(), roomId: z.string().uuid() })
  .strict();
export function rememberLastRoom(userId: string, roomId: string): void {
  const candidate = CandidateSchema.safeParse({ userId, roomId });
  if (!candidate.success) return;
  try {
    localStorage.setItem(LAST_ROOM_STORAGE_KEY, JSON.stringify(candidate.data));
  } catch {
    /* 保存禁止でもルーム操作は継続する。 */
  }
}
export function readLastRoom(userId: string): string | null {
  try {
    const candidate = CandidateSchema.safeParse(
      JSON.parse(localStorage.getItem(LAST_ROOM_STORAGE_KEY) ?? "null"),
    );
    return candidate.success && candidate.data.userId === userId
      ? candidate.data.roomId
      : null;
  } catch {
    return null;
  }
}
export function clearLastRoom(roomId?: string): void {
  try {
    if (roomId) {
      const candidate = CandidateSchema.safeParse(
        JSON.parse(localStorage.getItem(LAST_ROOM_STORAGE_KEY) ?? "null"),
      );
      if (candidate.success && candidate.data.roomId !== roomId) return;
    }
    localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
  } catch {
    /* 利用できない保存領域に依存しない。 */
  }
}
