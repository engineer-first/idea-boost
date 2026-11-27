import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { getBaseUrl, getGoogleClientId } from "@/lib/session/env";
import { localGoogleRedirectIssue } from "./local-google-redirect";
import { getLoginPath, sanitizeNextPath } from "./redirects";

export async function startGoogleAuthorization(
  next: string,
  state: string,
  nonce: string,
  purpose?: "account_link",
): Promise<void> {
  const redirectUri = `${getBaseUrl()}/auth/callback`;
  if (process.env.NODE_ENV === "development") {
    // 並行 worktree で、Google から別のポートのサーバーへ戻るのを開始前に止め、理由をログイン画面に出す。
    const issue = localGoogleRedirectIssue(
      redirectUri,
      (await headers()).get("host"),
    );
    if (issue) {
      const base = getLoginPath(next);
      const separator = base.includes("?") ? "&" : "?";
      redirect(`${base}${separator}error=${encodeURIComponent(issue)}`);
    }
  }
  const cookieStore = await cookies();
  cookieStore.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, nonce, next: sanitizeNextPath(next), purpose }),
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
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("prompt", "select_account");

  redirect(authorizeUrl.toString());
}
