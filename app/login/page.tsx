import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  LoginChoice,
  sanitizeNextPath,
  signInWithDevPassword,
  signInWithGoogle,
} from "@/features/auth";
import { inviteMetadata } from "@/features/room-lifecycle";
import { getCurrentUser } from "@/lib/session/current-user";
import { isAuthConfigured, isDevAuthEnabled } from "@/lib/session/env";

export const dynamic = "force-dynamic";

type LoginSearchParams = { error?: string; next?: string; guest_next?: string };

// 未ログインで招待URLを開くと /login?next=/invite/<コード> へ転送されるため、
// LINE 等のプレビューは転送先のこの画面を読む。招待からの転送では招待の説明を出す。
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}): Promise<Metadata> {
  const { next } = await searchParams;
  if (sanitizeNextPath(next).startsWith("/invite/")) return inviteMetadata;
  return { title: "ログイン | Idea Boost" };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const { error, next, guest_next } = await searchParams;
  if (await getCurrentUser()) {
    // 既にログイン済みなら戻り先（招待URL 等）へ直行する。
    redirect(sanitizeNextPath(next));
  }

  // next を各アクションに束縛して渡す。
  const safeNext = sanitizeNextPath(next);

  return (
    <LoginChoice
      // ゲストは名前登録後にguest_nextへ進む。Google・ログイン済み時はnextのまま。
      next={sanitizeNextPath(guest_next ?? next)}
      aboutHref={
        safeNext === "/"
          ? "/about"
          : `/about?next=${encodeURIComponent(safeNext)}`
      }
      error={error}
      isConfigured={isAuthConfigured()}
      showDevAuth={isDevAuthEnabled()}
      googleAction={signInWithGoogle.bind(null, safeNext)}
      passwordAction={signInWithDevPassword.bind(null, safeNext)}
    />
  );
}
