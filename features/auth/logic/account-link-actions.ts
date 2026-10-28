"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ACCOUNT_LINK_AUDIENCE,
  ACCOUNT_LINK_INTENT_COOKIE,
  ACCOUNT_LINK_INTENT_MAX_SECONDS,
} from "@/contracts/account-link";
import { ROOM_OAUTH_RESUME_COOKIE } from "@/contracts/room-entry";
import { getCurrentUser } from "@/lib/session/current-user";
import { getSessionSecret, isGoogleAuthConfigured } from "@/lib/session/env";
import { signToken } from "@/lib/session/token";
import { accountLinkResultPath } from "./account-link-redirects";
import { startGoogleAuthorization } from "./google-authorization";
import { sanitizeNextPath } from "./redirects";

const AccountLinkNextSchema = z.string().max(2048);

export async function startGoogleAccountLink(next: string): Promise<void> {
  const parsed = AccountLinkNextSchema.safeParse(next);
  const safeNext = sanitizeNextPath(parsed.success ? parsed.data : "/");
  const user = await getCurrentUser();
  const remaining = user
    ? Math.min(
        ACCOUNT_LINK_INTENT_MAX_SECONDS,
        user.exp - Math.floor(Date.now() / 1000),
      )
    : 0;
  if (!user || remaining <= 0)
    redirect(accountLinkResultPath(safeNext, "session_changed"));
  if (user.kind === "account") redirect(safeNext);
  if (!isGoogleAuthConfigured())
    redirect(accountLinkResultPath(safeNext, "unavailable"));
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const token = await signToken(
    { principal: user.sub, state, nonce, next: safeNext },
    {
      secret: getSessionSecret(),
      audience: ACCOUNT_LINK_AUDIENCE.intent,
      expiresInSeconds: remaining,
    },
  );
  const store = await cookies();
  store.set(ACCOUNT_LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remaining,
  });
  store.delete(ROOM_OAUTH_RESUME_COOKIE);
  await startGoogleAuthorization(safeNext, state, nonce, "account_link");
}
