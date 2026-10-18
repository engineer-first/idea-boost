import { z } from "zod";
import { CreateRoomInputSchema } from "./api";
import { SessionExpiresAtSchema } from "./session";

export const ROOM_ENTRY_MIN_SECONDS = 5 * 60 * 60;
export const ROOM_REAUTH_TTL_SECONDS = 10 * 60;
export const ROOM_OAUTH_RESUME_COOKIE = "idea_boost_oauth_resume";
export const ROOM_RESUME_COOKIE = "idea_boost_room_resume";
export const ROOM_ENTRY_AUDIENCE = {
  oauth: "idea-boost:room-oauth",
  resume: "idea-boost:room-resume",
  entry: "idea-boost:room-entry",
  admission: "idea-boost:room-admission",
} as const;
export const RoomEntryOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("create"), input: CreateRoomInputSchema }),
  z.strictObject({
    kind: z.literal("join"),
    inviteCode: z.string().regex(/^[A-Z0-9]{6}$/),
  }),
  z.strictObject({ kind: z.literal("return"), roomId: z.guid() }),
]);
export type RoomEntryOperation = z.infer<typeof RoomEntryOperationSchema>;
export const RoomOAuthResumeSchema = z
  .object({
    ticketId: z.guid(),
    principal: z.guid(),
    tabId: z.guid(),
    state: z.guid(),
    nonce: z.guid(),
    operation: RoomEntryOperationSchema,
    exp: SessionExpiresAtSchema,
  })
  .refine(
    (v) =>
      v.operation.kind !== "create" ||
      v.operation.input.expectedPrincipal === v.principal,
  );
export const RoomAdmissionSchema = z.object({
  ticketId: z.guid(),
  principal: z.guid(),
  roomId: z.guid(),
  sessionExp: SessionExpiresAtSchema,
  stage: z.enum(["lobby", "board"]),
  exp: SessionExpiresAtSchema,
});
export const RoomEntryTicketSchema = RoomAdmissionSchema.extend({
  tabId: z.guid(),
});
export const ConsumeRoomTicketRequestSchema = z.strictObject({
  ticket: z.string().min(1).max(8192),
});
export const RoomResumeResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    operation: RoomEntryOperationSchema,
    principal: z.guid(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["unavailable", "account_changed"]),
  }),
]);
export type RoomResumeResult = z.infer<typeof RoomResumeResultSchema>;
