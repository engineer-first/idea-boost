// セッション Cookie の発行・削除（Next サーバー側でのみ使う）。
// Cookie 名と中身の形式は contracts/session.ts が定める。
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/contracts/session";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7日

// Google OAuth の state / nonce を保持する一時 Cookie の名前。
// サインイン開始（Server Action）と callback（Route Handler）で共有する。
export const OAUTH_STATE_COOKIE = "idea_boost_oauth";

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
