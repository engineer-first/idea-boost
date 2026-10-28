// ログイン確定処理: 検証済みの本人性（ログイン主張）から
// (1) api-worker にユーザーを upsert し、(2) セッション Cookie を発行する。
// 開発用ログインと Google ログインの両方がこの1本に合流する。

import { SyncUserResponseSchema } from "@/contracts/api";
import {
  type LoginAssertion,
  type SessionPayload,
  TOKEN_AUDIENCE,
} from "@/contracts/session";
import { apiFetch } from "@/lib/api-client";
import { SESSION_TTL_SECONDS, setSessionCookie } from "@/lib/session/cookie";
import { getSessionSecret } from "@/lib/session/env";
import { signToken } from "@/lib/session/token";

const ASSERTION_TTL_SECONDS = 60;

export type EstablishSessionResult =
  | { ok: true; user: SessionPayload }
  | { ok: false; error: string };

export async function establishSession(
  assertion: LoginAssertion,
): Promise<EstablishSessionResult> {
  const secret = getSessionSecret();

  const assertionToken = await signToken(assertion, {
    secret,
    audience: TOKEN_AUDIENCE.loginAssertion,
    expiresInSeconds: ASSERTION_TTL_SECONDS,
  });

  // ログインフローの中核なので、ネットワーク障害・タイムアウト・不正 JSON も
  // 未処理例外にせず ok:false に畳む（呼び出し側がエラー表示へ倒せる形を保つ）。
  let res: Response;
  try {
    res = await apiFetch("/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion: assertionToken }),
    });
  } catch {
    return { ok: false, error: "ユーザー情報の同期に失敗しました。" };
  }

  if (!res.ok) {
    return { ok: false, error: "ユーザー情報の同期に失敗しました。" };
  }

  const body: unknown = await res.json().catch(() => null);
  const parsed = SyncUserResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "ユーザー情報の同期結果が不正です。" };
  }

  if (assertion.kind !== "google" && parsed.data.userId !== assertion.userId) {
    return { ok: false, error: "ユーザー情報の同期結果が不正です。" };
  }

  const user: SessionPayload =
    assertion.kind === "guest"
      ? { kind: "guest", sub: parsed.data.userId, email: null }
      : {
          kind: "account",
          sub: parsed.data.userId,
          email: assertion.email,
          name: assertion.name,
        };

  const sessionToken = await signToken(user, {
    secret,
    audience: TOKEN_AUDIENCE.session,
    expiresInSeconds: SESSION_TTL_SECONDS,
  });
  await setSessionCookie(sessionToken);

  return { ok: true, user };
}
