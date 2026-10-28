"use server";

import { getCurrentUser } from "@/lib/session/current-user";
import { prepareRoomEntrySession } from "@/lib/session/room-entry-session";

export type GuestRoomEntryResult =
  | { ok: true }
  | { ok: false; reason: "identity_unavailable" | "retry" | "reauth_required" };

export async function refreshGuestRoomEntry(): Promise<GuestRoomEntryResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "identity_unavailable" };
  const result = await prepareRoomEntrySession(user);
  // Cookieの更新だけを行い、本人の情報はブラウザへ返さない。
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
