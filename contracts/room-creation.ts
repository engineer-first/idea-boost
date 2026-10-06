import { z } from "zod";

export const ROOM_CREATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ROOM_CREATION_FUTURE_MS = 60_000;
export const ROOM_CREATION_GC_GRACE_MS = 5 * 60_000;
export const ROOM_CREATION_NAME_MAX = 80;
export const CreationRequestIdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());
export const CreationPrincipalSchema = z
  .object({ expectedPrincipal: z.string().uuid() })
  .strict();
export const CreationStatusInputSchema = CreationPrincipalSchema.extend({
  requestId: CreationRequestIdSchema,
});
export const CreationIssuedSchema = z
  .object({
    requestId: CreationRequestIdSchema.refine((id) => id[14] === "7"),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (v) =>
      creationIssuedAt(v.requestId) === v.issuedAt &&
      v.expiresAt === v.issuedAt + ROOM_CREATION_WINDOW_MS,
  );
export type CreationIssued = z.infer<typeof CreationIssuedSchema>;
export function creationIssuedAt(id: string): number | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
    ? Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)
    : null;
}
export function issueCreationId(now = Date.now()): CreationIssued {
  const time = now.toString(16).padStart(12, "0");
  const random = crypto.randomUUID();
  const requestId = `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`;
  return CreationIssuedSchema.parse({
    requestId,
    issuedAt: now,
    expiresAt: now + ROOM_CREATION_WINDOW_MS,
  });
}
export const CreationStatusSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    roomId: z.string().uuid(),
    inviteCode: z.string(),
    acceptance: z.enum(["open", "expired"]),
  }),
  z.object({
    kind: z.literal("closed"),
    acceptance: z.enum(["open", "expired"]),
  }),
  z.object({
    kind: z.literal("unknown"),
    acceptance: z.enum(["open", "expired"]),
  }),
]);
export type CreationStatus = z.infer<typeof CreationStatusSchema>;
export const CreationFailureSchema = z.object({
  error: z.string(),
  reason: z.enum([
    "actor_mismatch",
    "expired",
    "closed",
    "input_conflict",
    "update_required",
    "invalid_request",
    "unknown",
  ]),
});
export type CreationIdentity = {
  roomId: string;
  creator: string;
  requestId: string;
  expiresAt: number;
  legacy?: boolean;
};
export type CreationInspection = "ready" | "closed" | "pending";
