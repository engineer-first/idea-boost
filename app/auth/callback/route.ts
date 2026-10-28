// Google OIDC authorization code flow のコールバック。
// 1. state を一時 Cookie と照合（CSRF 防止）
// 2. code をトークンエンドポイントで交換
// 3. id_token を Google の JWKS で検証し、nonce を照合
// 4. establishSession でユーザー upsert + セッション Cookie 発行
import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ACCOUNT_LINK_AUDIENCE,
  ACCOUNT_LINK_INTENT_COOKIE,
  AccountLinkIntentSchema,
} from "@/contracts/account-link";
import {
  ROOM_ENTRY_AUDIENCE,
  ROOM_OAUTH_RESUME_COOKIE,
  ROOM_REAUTH_TTL_SECONDS,
  ROOM_RESUME_COOKIE,
  RoomOAuthResumeSchema,
} from "@/contracts/room-entry";
import {
  accountLinkResultPath,
  classifyAccountLinkCallback,
  completeGoogleAccountLink,
  getLoginPath,
  isEmailVerified,
  sanitizeNextPath,
} from "@/features/auth";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import {
  getBaseUrl,
  getGoogleClientId,
  getGoogleClientSecret,
  getSessionSecret,
  isGoogleAuthConfigured,
} from "@/lib/session/env";
import { establishSession } from "@/lib/session/establish";
import { signToken, verifyToken } from "@/lib/session/token";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const OauthStateSchema = z.object({
  purpose: z.literal("account_link").optional(),
  state: z.string().min(1),
  nonce: z.string().min(1),
  next: z.string().optional(),
});

const GoogleClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  nonce: z.string().optional(),
});

function redirectToLogin(
  origin: string,
  message: string,
  next?: string,
): NextResponse {
  const loginUrl = new URL(getLoginPath(next), origin);
  loginUrl.searchParams.set("error", message);
  return NextResponse.redirect(loginUrl);
}

function parseOauthStateCookie(
  value: string | undefined,
): z.infer<typeof OauthStateSchema> | null {
  if (!value) return null;
  try {
    const parsed = OauthStateSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { origin, searchParams } = request.nextUrl;

  if (!isGoogleAuthConfigured()) {
    return redirectToLogin(
      origin,
      "Google ログインの環境変数を設定してください。",
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const oauthState = parseOauthStateCookie(
    cookieStore.get(OAUTH_STATE_COOKIE)?.value,
  );
  cookieStore.delete(OAUTH_STATE_COOKIE);
  const resumeToken = cookieStore.get(ROOM_OAUTH_RESUME_COOKIE)?.value;
  cookieStore.delete(ROOM_OAUTH_RESUME_COOKIE);
  const linkToken = cookieStore.get(ACCOUNT_LINK_INTENT_COOKIE)?.value;
  cookieStore.delete(ACCOUNT_LINK_INTENT_COOKIE);
  const intent = linkToken
    ? await verifyToken(linkToken, AccountLinkIntentSchema, {
        secret: getSessionSecret(),
        audience: ACCOUNT_LINK_AUDIENCE.intent,
      })
    : null;
  const linkRoute = classifyAccountLinkCallback(
    linkToken,
    intent,
    state,
    oauthState,
  );
  if (linkRoute === "failed")
    return NextResponse.redirect(
      new URL(accountLinkResultPath("/", "failed"), origin),
    );
  const linking = linkRoute === "link" && intent !== null;
  const resume = resumeToken
    ? await verifyToken(resumeToken, RoomOAuthResumeSchema, {
        secret: getSessionSecret(),
        audience: ROOM_ENTRY_AUDIENCE.oauth,
      })
    : null;

  if (
    !state ||
    !oauthState ||
    state !== oauthState.state ||
    (!linking &&
      resumeToken &&
      (!resume || resume.state !== state || resume.nonce !== oauthState.nonce))
  ) {
    return redirectToLogin(origin, "ログインをやり直してください。");
  }

  // 戻り先は state を照合できた Cookie からだけ復元する。
  const next = sanitizeNextPath(linking ? intent.next : oauthState.next);
  const failed = (message: string): NextResponse =>
    linking
      ? NextResponse.redirect(
          new URL(accountLinkResultPath(next, "failed"), origin),
        )
      : redirectToLogin(origin, message, next);
  if (!code) {
    return linking
      ? NextResponse.redirect(
          new URL(accountLinkResultPath(next, "cancelled"), origin),
        )
      : failed("ログインをやり直してください。");
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: getGoogleClientId(),
        client_secret: getGoogleClientSecret(),
        redirect_uri: `${getBaseUrl()}/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", tokenResponse.status);
      return failed("ログインに失敗しました。");
    }

    const { id_token: idToken } = (await tokenResponse.json()) as {
      id_token?: string;
    };
    if (!idToken) {
      return failed("ログインに失敗しました。");
    }

    let claims: z.infer<typeof GoogleClaimsSchema>;
    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: GOOGLE_ISSUERS,
        audience: getGoogleClientId(),
      });
      const parsed = GoogleClaimsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("unexpected id_token claims");
      }
      claims = parsed.data;
    } catch {
      console.error("Failed to verify Google id_token");
      return failed("ログインに失敗しました。");
    }

    if (claims.nonce !== oauthState.nonce) {
      return failed("ログインをやり直してください。");
    }

    // クレーム欠落も未検証扱い（fail-closed）。email でのアカウントリンクがあるため。
    if (!isEmailVerified(claims)) {
      return failed("メールアドレスが確認されていません。");
    }

    if (linking) {
      const result = await completeGoogleAccountLink(intent, {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
      });
      return NextResponse.redirect(
        new URL(accountLinkResultPath(next, result), origin),
      );
    }

    const result = await establishSession({
      kind: "google",
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name,
    });

    if (!result.ok) {
      return redirectToLogin(origin, result.error, next);
    }
    if (resume) {
      if (result.user.sub !== resume.principal) {
        return NextResponse.redirect(
          new URL("/auth/resume?error=account_changed", origin),
        );
      }
      const remaining = Math.min(
        ROOM_REAUTH_TTL_SECONDS,
        resume.exp - Math.floor(Date.now() / 1000),
      );
      if (remaining <= 0)
        return NextResponse.redirect(
          new URL("/auth/resume?error=unavailable", origin),
        );
      const token = await signToken(
        { ...resume, ticketId: crypto.randomUUID() },
        {
          secret: getSessionSecret(),
          audience: ROOM_ENTRY_AUDIENCE.resume,
          expiresInSeconds: remaining,
        },
      );
      cookieStore.set(ROOM_RESUME_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: remaining,
      });
      return NextResponse.redirect(new URL("/auth/resume", origin));
    }
  } catch {
    // 通信・JSON読取・セッション確立の例外でも認証成功には進めない。
    console.error("Google login processing failed");
    return failed("ログインに失敗しました。");
  }

  // ログイン開始時に保存した戻り先（招待URL 等）へ戻す。安全化済みだが二重で通す。
  return NextResponse.redirect(new URL(next, origin));
}
