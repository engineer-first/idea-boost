// OAuthコールバック専用。クライアントから呼べるServer Actionにはしない。
import {
  ACCOUNT_LINK_AUDIENCE,
  type AccountLinkIntent,
  type AccountLinkResult,
  LinkGoogleResponseSchema,
} from "@/contracts/account-link";
import { TOKEN_AUDIENCE } from "@/contracts/session";
import { apiFetch } from "@/lib/api-client";
import { SESSION_TTL_SECONDS, setSessionCookie } from "@/lib/session/cookie";
import { getCurrentUser } from "@/lib/session/current-user";
import { getSessionSecret } from "@/lib/session/env";
import { signToken } from "@/lib/session/token";

export async function completeGoogleAccountLink(
  intent: AccountLinkIntent,
  claims: { sub: string; email: string; name?: string },
): Promise<AccountLinkResult> {
  const user = await getCurrentUser();
  if (user?.kind !== "guest" || user.sub !== intent.principal)
    return "session_changed";
  try {
    const secret = getSessionSecret();
    const assertion = await signToken(
      {
        principal: intent.principal,
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name,
      },
      {
        secret,
        audience: ACCOUNT_LINK_AUDIENCE.assertion,
        expiresInSeconds: 60,
      },
    );
    const response = await apiFetch("/api/auth/link-google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
    const parsed = LinkGoogleResponseSchema.safeParse(await response.json());
    if (!parsed.success) return "failed";
    const result = parsed.data;
    if (response.status === 409 && !result.ok)
      return result.reason === "not_guest" ? "session_changed" : result.reason;
    if (!response.ok || !result.ok || result.userId !== intent.principal)
      return "failed";
    const token = await signToken(
      {
        kind: "account",
        sub: intent.principal,
        email: claims.email,
        name: claims.name,
      },
      {
        secret,
        audience: TOKEN_AUDIENCE.session,
        expiresInSeconds: SESSION_TTL_SECONDS,
      },
    );
    await setSessionCookie(token);
    return "linked";
  } catch {
    return "failed";
  }
}
