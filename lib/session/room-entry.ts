import { RoomInfoResponseSchema } from "@/contracts/api";
import {
  ROOM_ENTRY_AUDIENCE,
  ROOM_ENTRY_MIN_SECONDS,
  ROOM_REAUTH_TTL_SECONDS,
  RoomAdmissionSchema,
  RoomEntryTicketSchema,
} from "@/contracts/room-entry";
import type { VerifiedSession } from "@/contracts/session";
import { apiFetch } from "@/lib/api-client";
import { getSessionSecret } from "./env";
import { signToken, verifyToken } from "./token";

export type RoomEntryStage = "lobby" | "board";
export type ConsumeRoomEntryResult =
  | { ok: true; admission?: string }
  | { ok: false };
export function hasRoomEntryTime(
  user: VerifiedSession | null,
  now = Math.floor(Date.now() / 1000),
): boolean {
  // PreviewはAccessが各リクエストで本人を検証し、最大1時間のセッションを渡す。
  if (process.env.PREVIEW_ENABLED === "true") {
    return user !== null && user.exp > now;
  }
  return user !== null && user.exp - now >= ROOM_ENTRY_MIN_SECONDS;
}
export async function issueRoomEntry(
  roomId: string,
  user: VerifiedSession,
  stage: RoomEntryStage = "board",
  tabId?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    {
      ticketId: crypto.randomUUID(),
      principal: user.sub,
      roomId,
      sessionExp: user.exp,
      stage,
      ...(tabId ? { tabId } : {}),
    },
    {
      secret: getSessionSecret(),
      audience: tabId
        ? ROOM_ENTRY_AUDIENCE.entry
        : ROOM_ENTRY_AUDIENCE.admission,
      expiresInSeconds: tabId
        ? Math.min(ROOM_REAUTH_TTL_SECONDS, user.exp - now)
        : user.exp - now,
    },
  );
}
export async function bindRoomEntry(
  admission: string,
  roomId: string,
  user: VerifiedSession,
  tabId: string,
): Promise<string | null> {
  const ticket = await verifyToken(admission, RoomAdmissionSchema, {
    secret: getSessionSecret(),
    audience: ROOM_ENTRY_AUDIENCE.admission,
  });
  if (
    !ticket ||
    ticket.principal !== user.sub ||
    ticket.sessionExp !== user.exp ||
    ticket.roomId !== roomId
  )
    return null;
  try {
    const response = await apiFetch(`/api/rooms/${roomId}`, {
      cache: "no-store",
    });
    const room = response.ok
      ? RoomInfoResponseSchema.safeParse(
          await response.json().catch(() => null),
        )
      : null;
    if (!room?.success || room.data.roomId !== roomId) return null;
    const consumed = await apiFetch("/api/auth/consume-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: admission }),
    });
    if (!consumed.ok) return null;
  } catch {
    return null;
  }
  return issueRoomEntry(roomId, user, ticket.stage, tabId);
}
export async function verifyRoomEntry(
  token: string | undefined,
  roomId: string,
  user: VerifiedSession,
  tabId: string,
  stage: RoomEntryStage = "board",
): Promise<ConsumeRoomEntryResult> {
  if (!token) return { ok: false };
  const ticket = await verifyToken(token, RoomEntryTicketSchema, {
    secret: getSessionSecret(),
    audience: ROOM_ENTRY_AUDIENCE.entry,
  });
  if (
    !ticket ||
    ticket.principal !== user.sub ||
    ticket.sessionExp !== user.exp ||
    ticket.roomId !== roomId ||
    ticket.tabId !== tabId ||
    (ticket.stage === "board" && stage !== "board")
  )
    return { ok: false };
  try {
    const response = await apiFetch(`/api/rooms/${roomId}`, {
      cache: "no-store",
    });
    const room = response.ok
      ? RoomInfoResponseSchema.safeParse(
          await response.json().catch(() => null),
        )
      : null;
    if (!room?.success || room.data.roomId !== roomId) return { ok: false };
    const consumed = await apiFetch("/api/auth/consume-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: token }),
    });
    if (!consumed.ok) return { ok: false };
    return {
      ok: true,
      ...(ticket.stage === "lobby" && stage === "lobby"
        ? { admission: await issueRoomEntry(roomId, user, "board") }
        : {}),
    };
  } catch {
    return { ok: false };
  }
}
