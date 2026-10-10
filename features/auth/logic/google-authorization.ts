import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { getBaseUrl, getGoogleClientId } from "@/lib/session/env";
import { sanitizeNextPath } from "./redirects";

export async function startGoogleAuthorization(
  next: string,
  state: string,
  nonce: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, nonce, next: sanitizeNextPath(next) }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    },
  );

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", getGoogleClientId());
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${getBaseUrl()}/auth/callback`,
  );
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("prompt", "select_account");

  redirect(authorizeUrl.toString());
}
