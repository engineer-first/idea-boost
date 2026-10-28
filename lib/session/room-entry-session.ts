import {
  GuestRefreshResponseSchema,
  TOKEN_AUDIENCE,
  type VerifiedSession,
} from "@/contracts/session";
import { apiFetch } from "@/lib/api-client";
import { SESSION_TTL_SECONDS, setSessionCookie } from "./cookie";
import { getSessionSecret } from "./env";
import { hasRoomEntryTime } from "./room-entry";
import { signToken } from "./token";

export type PrepareRoomEntrySessionResult =
  | { ok: true; user: VerifiedSession }
  | { ok: false; reason: "identity_unavailable" | "retry" | "reauth_required" };

export async function prepareRoomEntrySession(
  user: VerifiedSession,
  now = Math.floor(Date.now() / 1000),
): Promise<PrepareRoomEntrySessionResult> {
  if (hasRoomEntryTime(user, now)) return { ok: true, user };
  if (user.kind !== "guest") return { ok: false, reason: "reauth_required" };
  try {
    const response = await apiFetch("/api/auth/guest/refresh", {
      method: "POST",
    });
    if ([401, 403, 404, 409].includes(response.status))
      return { ok: false, reason: "identity_unavailable" };
    if (!response.ok) return { ok: false, reason: "retry" };
    const parsed = GuestRefreshResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, reason: "retry" };
    if (parsed.data.userId !== user.sub)
      return { ok: false, reason: "identity_unavailable" };
    const updated = { ...user, exp: now + SESSION_TTL_SECONDS };
    const token = await signToken(updated, {
      secret: getSessionSecret(),
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: Math.max(
        SESSION_TTL_SECONDS,
        updated.exp - Math.floor(Date.now() / 1000),
      ),
      expiresAtSeconds: updated.exp,
    });
    await setSessionCookie(token);
    return { ok: true, user: updated };
  } catch {
    return { ok: false, reason: "retry" };
  }
}
