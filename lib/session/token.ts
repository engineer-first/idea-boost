// セッション/ログイン主張トークンの署名と検証。
// Node (Next サーバー) と workerd (api-worker) の両方で動くよう、
// Web Crypto ベースの jose のみに依存し、環境固有 API は使わない。
// 検証失敗は例外ではなく null で返す。呼び出し側の「未認証」分岐を
// try/catch ではなく通常の制御フローで書けるようにするため。
import { jwtVerify, SignJWT } from "jose";
import type { z } from "zod";

const ISSUER = "idea-boost";

export type SignTokenOptions = {
  secret: string;
  audience: string;
  expiresInSeconds: number;
};

export type VerifyTokenOptions = {
  secret: string;
  audience: string;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: Record<string, unknown>,
  options: SignTokenOptions,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(options.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + options.expiresInSeconds)
    .sign(secretKey(options.secret));
}

export async function verifyToken<Schema extends z.ZodTypeAny>(
  token: string,
  schema: Schema,
  options: VerifyTokenOptions,
): Promise<z.infer<Schema> | null> {
  let claims: unknown;
  try {
    const { payload } = await jwtVerify(token, secretKey(options.secret), {
      issuer: ISSUER,
      audience: options.audience,
      algorithms: ["HS256"],
    });
    claims = payload;
  } catch {
    return null;
  }

  const parsed = schema.safeParse(claims);
  return parsed.success ? parsed.data : null;
}
