"use server";

import { RoomInfoResponseSchema } from "@/contracts/api";
import { isUuid } from "@/contracts/ids";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { prepareRoomEntrySession } from "@/lib/session/room-entry-session";

export type GuestRoomEntryResult =
  | { ok: true }
  | { ok: false; reason: "identity_unavailable" | "retry" | "reauth_required" };

export async function refreshGuestRoomEntry(
  roomId: string,
): Promise<GuestRoomEntryResult> {
  if (!isUuid(roomId)) return { ok: false, reason: "identity_unavailable" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "identity_unavailable" };
  try {
    const response = await apiFetch(`/api/rooms/${roomId}`, {
      cache: "no-store",
    });
    if ([401, 403, 404].includes(response.status))
      return { ok: false, reason: "identity_unavailable" };
    if (response.status !== 200) return { ok: false, reason: "retry" };
    const room = RoomInfoResponseSchema.safeParse(await response.json());
    if (!room.success || room.data.roomId !== roomId)
      return { ok: false, reason: "retry" };
  } catch {
    return { ok: false, reason: "retry" };
  }
  const result = await prepareRoomEntrySession(user);
  // Cookieの更新だけを行い、本人の情報はブラウザへ返さない。
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
