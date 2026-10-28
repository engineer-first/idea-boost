// セッションと認証に関する境界スキーマ。
// Next (Cookie発行側) と api-worker (検証・D1書き込み側) の両方から参照される
// コントラクト層。実装がどう変わっても、この形だけは互換を保つ。
import { z } from "zod";
import { RoomDisplayNameSchema } from "./room-protocol";

// ゲスト判定は kind で行い、email や name の有無で判定しない。
// guid は既存の本人 ID の受理範囲を維持する。
export const AccountSessionPayloadSchema = z.object({
  kind: z.literal("account"),
  sub: z.guid(),
  email: z.email(),
  name: z.string().optional(),
});
export const GuestSessionPayloadSchema = z.object({
  kind: z.literal("guest"),
  sub: z.guid(),
  email: z.null(),
  name: z.string().optional(),
});

// 既存ユーザーを一斉ログアウトさせないため、kind がない旧形式だけを補完する。
const normalizeLegacySession = z.unknown().transform((input) => {
  if (typeof input === "object" && input !== null && !("kind" in input))
    return { ...input, kind: "account" };
  return input;
});
export const SessionPayloadSchema = normalizeLegacySession.pipe(
  z.discriminatedUnion("kind", [
    AccountSessionPayloadSchema,
    GuestSessionPayloadSchema,
  ]),
);

export const SessionExpiresAtSchema = z.int().positive();
export const VerifiedSessionSchema = normalizeLegacySession.pipe(
  z.discriminatedUnion("kind", [
    AccountSessionPayloadSchema.extend({ exp: SessionExpiresAtSchema }),
    GuestSessionPayloadSchema.extend({ exp: SessionExpiresAtSchema }),
  ]),
);
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;
export type VerifiedSession = z.infer<typeof VerifiedSessionSchema>;
export type GuestSession = Extract<VerifiedSession, { kind: "guest" }>;
export type AccountSession = Extract<VerifiedSession, { kind: "account" }>;

export const GuestIdentityInputSchema = z.strictObject({
  name: RoomDisplayNameSchema,
});
export type GuestIdentityInput = z.infer<typeof GuestIdentityInputSchema>;

export const GuestRefreshResponseSchema = z.strictObject({ userId: z.guid() });
export type GuestRefreshResponse = z.infer<typeof GuestRefreshResponseSchema>;

// ログイン確定時に Next から api-worker へ渡す本人性の主張。
// SESSION_SECRET で署名した短命トークンとして送るため、api-worker は
// 内容を信頼してユーザーを D1 へ upsert できる（無認証の書き込み口を作らない）。
export const LoginAssertionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("guest"),
    userId: z.guid(),
    displayName: RoomDisplayNameSchema,
  }),
  z.object({
    kind: z.literal("google"),
    googleSub: z.string().min(1),
    email: z.email(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("dev"),
    userId: z.guid(),
    email: z.email(),
    name: z.string().optional(),
  }),
]);

export type LoginAssertion = z.infer<typeof LoginAssertionSchema>;

// audience でトークンの用途を分離する。セッショントークンを
// ログイン主張として（またはその逆に）流用するリプレイを防ぐ。
export const TOKEN_AUDIENCE = {
  session: "idea-boost:session",
  loginAssertion: "idea-boost:login-assertion",
} as const;

// セッショントークンを保持する Cookie の名前。
// Next（発行側）と api-worker（検証側）の両方が参照する。
export const SESSION_COOKIE_NAME = "idea_boost_session";
