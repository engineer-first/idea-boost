"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ROOM_ENTRY_AUDIENCE,
  ROOM_OAUTH_RESUME_COOKIE,
  ROOM_REAUTH_TTL_SECONDS,
  ROOM_RESUME_COOKIE,
  type RoomEntryOperation,
  RoomEntryOperationSchema,
  RoomOAuthResumeSchema,
  type RoomResumeResult,
} from "@/contracts/room-entry";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { getSessionSecret, isGoogleAuthConfigured } from "@/lib/session/env";
import {
  bindRoomEntry,
  type ConsumeRoomEntryResult,
  type RoomEntryStage,
  verifyRoomEntry,
} from "@/lib/session/room-entry";
import { signToken, verifyToken } from "@/lib/session/token";
import { startGoogleAuthorization } from "./google-authorization";

export async function startRoomReauthentication(
  operation: RoomEntryOperation,
  tabId: string,
): Promise<void> {
  const parsed = RoomEntryOperationSchema.safeParse(operation);
  const tab = z.string().uuid().safeParse(tabId);
  const user = await getCurrentUser();
  if (
    !parsed.success ||
    !tab.success ||
    !user ||
    (parsed.data.kind === "create" &&
      parsed.data.input.expectedPrincipal !== user.sub)
  ) {
    redirect(
      `/login?error=${encodeURIComponent("ログイン状態を確認してください。")}`,
    );
  }
  if (!isGoogleAuthConfigured()) redirect("/auth/resume?error=unavailable");
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const token = await signToken(
    {
      ticketId: crypto.randomUUID(),
      principal: user.sub,
      tabId: tab.data,
      state,
      nonce,
      operation: parsed.data,
    },
    {
      secret: getSessionSecret(),
      audience: ROOM_ENTRY_AUDIENCE.oauth,
      expiresInSeconds: ROOM_REAUTH_TTL_SECONDS,
    },
  );
  const store = await cookies();
  store.delete(ROOM_RESUME_COOKIE);
  store.set(ROOM_OAUTH_RESUME_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ROOM_REAUTH_TTL_SECONDS,
  });
  await startGoogleAuthorization("/auth/resume", state, nonce);
}

export async function consumeRoomResume(
  tabId: string,
): Promise<RoomResumeResult> {
  const store = await cookies();
  const token = store.get(ROOM_RESUME_COOKIE)?.value;
  if (!token || !z.string().uuid().safeParse(tabId).success)
    return { ok: false, reason: "unavailable" };
  const context = await verifyToken(token, RoomOAuthResumeSchema, {
    secret: getSessionSecret(),
    audience: ROOM_ENTRY_AUDIENCE.resume,
  });
  const user = await getCurrentUser();
  if (!context || context.tabId !== tabId || !user)
    return { ok: false, reason: "unavailable" };
  if (context.principal !== user.sub) {
    store.delete(ROOM_RESUME_COOKIE);
    return { ok: false, reason: "account_changed" };
  }
  store.delete(ROOM_RESUME_COOKIE);
  try {
    const response = await apiFetch("/api/auth/consume-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: token }),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    operation: context.operation,
    principal: context.principal,
  };
}

export async function consumeRoomEntry(
  token: string,
  roomId: string,
  tabId: string,
  stage: RoomEntryStage = "board",
): Promise<ConsumeRoomEntryResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(tabId).success)
    return { ok: false };
  return verifyRoomEntry(token, roomId, user, tabId, stage);
}
export async function bindRoomEntryContinuation(
  admission: string,
  roomId: string,
  tabId: string,
): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(tabId).success) return null;
  return bindRoomEntry(admission, roomId, user, tabId);
}
