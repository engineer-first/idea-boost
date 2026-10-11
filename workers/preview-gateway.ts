import { createRemoteJWKSet, jwtVerify } from "jose";
import { SyncUserResponseSchema } from "../contracts/api";
import {
  type PreviewAccessClaims,
  PreviewAccessClaimsSchema,
} from "../contracts/preview";
import {
  SESSION_COOKIE_NAME,
  TOKEN_AUDIENCE,
  VerifiedSessionSchema,
} from "../contracts/session";
import { sessionSecretIssue } from "../lib/session/secret";
import { signToken, verifyToken } from "../lib/session/token";
import { isPreviewEmailAllowed } from "./lib/preview-policy";
import { getCookieValue } from "./lib/session";

export type PreviewGatewayEnv = {
  PREVIEW_ENABLED?: string;
  PREVIEW_ACCESS_ISSUER?: string;
  PREVIEW_ACCESS_AUD?: string;
  PREVIEW_ALLOWED_EMAILS?: string;
  PREVIEW_PROBE_TOKEN?: string;
  SESSION_SECRET?: string;
  API_WORKER: { fetch: typeof fetch };
};
const PREVIEW_COOKIE = "__Host-idea_boost_preview_session";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function deny(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function previewGateway(
  request: Request,
  env: PreviewGatewayEnv,
  next: (request: Request) => Promise<Response>,
): Promise<Response> {
  const {
    PREVIEW_ACCESS_ISSUER: issuer,
    PREVIEW_ACCESS_AUD: audience,
    SESSION_SECRET: secret,
  } = env;
  if (
    env.PREVIEW_ENABLED !== "true" ||
    !issuer ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    !audience ||
    !env.PREVIEW_ALLOWED_EMAILS ||
    !secret ||
    sessionSecretIssue(secret)
  )
    return deny(503, "Preview認証設定が未完了です。");
  const url = new URL(request.url);
  if (
    url.pathname === "/api/health" &&
    request.method === "GET" &&
    env.PREVIEW_PROBE_TOKEN &&
    env.PREVIEW_PROBE_TOKEN.length >= 32 &&
    request.headers.get("X-Preview-Probe-Token") === env.PREVIEW_PROBE_TOKEN
  ) {
    return env.API_WORKER.fetch(
      new Request("https://preview-api.internal/api/preview/health", {
        headers: { "X-Preview-Probe-Token": env.PREVIEW_PROBE_TOKEN },
      }),
    );
  }
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    getCookieValue(request.headers.get("Cookie"), "CF_Authorization");
  if (!token)
    return deny(401, "許可したGoogleアカウントでログインしてください。");
  let identity: PreviewAccessClaims;
  try {
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keySets.set(issuer, keys);
    }
    const verified = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "exp", "iat"],
    });
    identity = PreviewAccessClaimsSchema.parse(verified.payload);
    if (!isPreviewEmailAllowed(identity.email, env.PREVIEW_ALLOWED_EMAILS))
      return deny(401, "許可したGoogleアカウントでログインしてください。");
  } catch {
    return deny(
      401,
      "ログインを検証できませんでした。再ログインしてください。",
    );
  }
  if (
    url.pathname.startsWith("/dev/") ||
    url.pathname.startsWith("/api/verification/") ||
    url.pathname.startsWith("/auth/")
  )
    return deny(404, "not found");
  if (
    (request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      !["GET", "HEAD", "OPTIONS"].includes(request.method)) &&
    request.headers.get("Origin") !== url.origin
  )
    return deny(403, "同じPreview画面から操作してください。");
  const previewToken = getCookieValue(
    request.headers.get("Cookie"),
    PREVIEW_COOKIE,
  );
  const session = previewToken
    ? await verifyToken(previewToken, VerifiedSessionSchema, {
        secret,
        audience: TOKEN_AUDIENCE.session,
      })
    : null;
  let appToken = previewToken;
  let setCookie = false;
  let ttl = Math.min(3600, identity.exp - Math.floor(Date.now() / 1000));
  if (ttl <= 0) return deny(401, "ログインの期限が切れました。");
  if (
    !session ||
    session.email !== identity.email ||
    session.exp > identity.exp
  ) {
    try {
      const assertion = await signToken(
        {
          kind: "google",
          googleSub: `access:${identity.sub}`,
          email: identity.email,
          name: identity.email.split("@")[0],
        },
        {
          secret,
          audience: TOKEN_AUDIENCE.loginAssertion,
          expiresInSeconds: 60,
        },
      );
      const synced = await env.API_WORKER.fetch(
        new Request("https://preview-api.internal/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assertion }),
          signal: AbortSignal.timeout(10000),
        }),
      );
      if (!synced.ok)
        return deny(503, "Previewの本人情報を登録できませんでした。");
      const result = SyncUserResponseSchema.parse(await synced.json());
      ttl = Math.min(3600, identity.exp - Math.floor(Date.now() / 1000));
      if (ttl <= 0) return deny(401, "ログインの期限が切れました。");
      appToken = await signToken(
        {
          sub: result.userId,
          email: identity.email,
          name: identity.email.split("@")[0],
        },
        {
          secret,
          audience: TOKEN_AUDIENCE.session,
          expiresInSeconds: ttl,
          expiresAtSeconds: identity.exp,
        },
      );
      setCookie = true;
    } catch {
      return deny(503, "Previewのログイン準備に失敗しました。");
    }
  }
  const headers = new Headers(request.headers);
  // ブラウザ由来の本番/アプリCookieを無視し、検証した本人だけをNext/APIへ渡す。
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${appToken}`);
  headers.set("X-Idea-Boost-Preview-Origin", url.origin);
  headers.delete("Cf-Access-Jwt-Assertion");
  const authenticated = new Request(request, { headers });
  const response =
    url.pathname === "/login" || url.pathname === "/"
      ? Response.redirect(`${url.origin}/preview`, 302)
      : await next(authenticated);
  // WebSocketの101を再構築するとupgradeを失うため、そのResponseを直接返す。
  if (response.status === 101) return response;
  const outgoing = new Response(response.body, response);
  outgoing.headers.set("Cache-Control", "private, no-store");
  // Nextが通常ログアウトで発行したCookieもPreview名へ変換する。
  const nextCookies = response.headers.getSetCookie();
  outgoing.headers.delete("Set-Cookie");
  let clearedSession = false;
  for (const cookie of nextCookies) {
    if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      clearedSession = getCookieValue(cookie, SESSION_COOKIE_NAME) === "";
      const converted = cookie.replace(
        `${SESSION_COOKIE_NAME}=`,
        `${PREVIEW_COOKIE}=`,
      );
      outgoing.headers.append(
        "Set-Cookie",
        /;\s*Secure(?:;|$)/i.test(converted)
          ? converted
          : `${converted}; Secure`,
      );
    } else outgoing.headers.append("Set-Cookie", cookie);
  }
  if (setCookie && !clearedSession)
    outgoing.headers.append(
      "Set-Cookie",
      `${PREVIEW_COOKIE}=${appToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${ttl}`,
    );
  return outgoing;
}
