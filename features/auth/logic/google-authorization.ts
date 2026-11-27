import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { getBaseUrl, getGoogleClientId } from "@/lib/session/env";
import { describeLocalGoogleRedirectIssue } from "./local-google-redirect";
import { sanitizeNextPath } from "./redirects";

/**
 * 開発時だけ、Google の戻り先（NEXT_PUBLIC_SITE_URL）が、いま開いている worktree の
 * サーバーとずれていれば理由を返す。並行 worktree で別ポートのサーバーへ戻るのを防ぐ。
 * 呼び出し元は Cookie を書き換える前に呼び、理由を自分の画面で伝える。
 */
export async function localGoogleRedirectIssue(): Promise<string | null> {
  if (process.env.NODE_ENV !== "development") return null;
  return describeLocalGoogleRedirectIssue(
    getBaseUrl(),
    (await headers()).get("host"),
  );
}

export async function startGoogleAuthorization(
  next: string,
  state: string,
  nonce: string,
  purpose?: "account_link",
): Promise<void> {
  // 呼び出し元が先に確認して理由を伝える。ここは確認を忘れた呼び出し元の安全網。
  const issue = await localGoogleRedirectIssue();
  if (issue) throw new Error(issue);
  const redirectUri = `${getBaseUrl()}/auth/callback`;
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
