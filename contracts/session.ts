// セッションと認証に関する境界スキーマ。
// Next (Cookie発行側) と api-worker (検証・D1書き込み側) の両方から参照される
// コントラクト層。実装がどう変わっても、この形だけは互換を保つ。
import { z } from "zod";

// セッショントークン (HS256 JWT) のペイロード。ブラウザの HttpOnly Cookie に入る。
export const SessionPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

// ログイン確定時に Next から api-worker へ渡す本人性の主張。
// SESSION_SECRET で署名した短命トークンとして送るため、api-worker は
// 内容を信頼してユーザーを D1 へ upsert できる（無認証の書き込み口を作らない）。
export const LoginAssertionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("google"),
    googleSub: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("dev"),
    userId: z.string().uuid(),
    email: z.string().email(),
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
