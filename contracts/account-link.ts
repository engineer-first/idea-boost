import { z } from "zod";
import { SessionExpiresAtSchema } from "./session";

export const ACCOUNT_LINK_INTENT_COOKIE = "idea_boost_account_link";
export const ACCOUNT_LINK_INTENT_MAX_SECONDS = 600;
export const ACCOUNT_LINK_AUDIENCE = {
  intent: "idea-boost:account-link-intent",
  assertion: "idea-boost:account-link-assertion",
} as const;
export const ACCOUNT_LINK_RESULT_PARAM = "account_link";

export const AccountLinkIntentSchema = z.object({
  principal: z.guid(),
  state: z.guid(),
  nonce: z.guid(),
  next: z.string(),
  exp: SessionExpiresAtSchema,
});
export type AccountLinkIntent = z.infer<typeof AccountLinkIntentSchema>;
export const AccountLinkAssertionSchema = z.object({
  principal: z.guid(),
  googleSub: z.string().min(1),
  email: z.email(),
  name: z.string().optional(),
});
export const LinkGoogleRequestSchema = z.strictObject({
  assertion: z.string().min(1).max(8192),
});
export const LinkGoogleResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), userId: z.guid() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["google_account_in_use", "already_linked", "not_guest"]),
  }),
]);
export type LinkGoogleResponse = z.infer<typeof LinkGoogleResponseSchema>;
export const AccountLinkResultSchema = z.enum([
  "linked",
  "cancelled",
  "failed",
  "google_account_in_use",
  "already_linked",
  "session_changed",
  "unavailable",
]);
export type AccountLinkResult = z.infer<typeof AccountLinkResultSchema>;
