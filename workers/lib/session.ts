// api-worker 側のセッション検証。Next が発行した HttpOnly Cookie の
// セッショントークンを、共有秘密 (SESSION_SECRET) で検証する。
// トークンの署名・検証ロジック自体は lib/session/token.ts を共有する。
import {
  SESSION_COOKIE_NAME,
  TOKEN_AUDIENCE,
  type VerifiedSession,
  VerifiedSessionSchema,
} from "../../contracts/session";
import { verifyToken } from "../../lib/session/token";

export function getCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

export async function getSessionFromRequest(
  request: Request,
  secret: string,
): Promise<VerifiedSession | null> {
  const token = getCookieValue(
    request.headers.get("Cookie"),
    SESSION_COOKIE_NAME,
  );
  if (!token) return null;
  return verifyToken(token, VerifiedSessionSchema, {
    secret,
    audience: TOKEN_AUDIENCE.session,
  });
}
