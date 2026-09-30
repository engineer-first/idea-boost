"use server";

// 認証の Server Actions。
// - 開発用ログイン: 固定ユーザー + 固定パスワード（development のみ）
// - Google ログイン: OIDC authorization code flow を開始する
// どちらも最終的に lib/session/establish.ts の establishSession に合流し、
// api-worker へのユーザー upsert とセッション Cookie の発行を行う。
//
// next: ログイン後の戻り先。招待URL（/invite/[code]）をログアウト状態で開いた
// ときに元のURLへ戻すため、page 側から .bind(null, next) で渡される。
// 値は必ず sanitizeNextPath でアプリ内相対パスに限定する（オープンリダイレクト防止）。
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { DEV_PASSWORD, findDevUser } from "@/lib/session/dev-users";
import {
  getBaseUrl,
  getGoogleClientId,
  isDevAuthEnabled,
  isGoogleAuthConfigured,
} from "@/lib/session/env";
import { establishSession } from "@/lib/session/establish";
import { getLoginPath, sanitizeNextPath } from "./redirects";

function loginError(message: string, next?: string): never {
  const base = getLoginPath(next);
  const separator = base.includes("?") ? "&" : "?";
  redirect(`${base}${separator}error=${encodeURIComponent(message)}`);
}

export type DevAuthState = { error?: string };

export async function signInWithDevPassword(
  next: string,
  _previousState: DevAuthState,
  formData: FormData,
): Promise<DevAuthState> {
  if (!isDevAuthEnabled()) {
    return { error: "開発用ログインは無効です。" };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const devUser = findDevUser(email);
  if (!devUser || password !== DEV_PASSWORD) {
    return { error: "メールアドレスまたはパスワードが違います。" };
  }

  const result = await establishSession({
    kind: "dev",
    userId: devUser.id,
    email: devUser.email,
    name: devUser.name,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect(sanitizeNextPath(next));
}

export async function signInWithGoogle(next: string): Promise<void> {
  if (!isGoogleAuthConfigured()) {
    loginError("Google ログインの環境変数を設定してください。", next);
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

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

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
