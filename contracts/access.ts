import { z } from "zod";

export const PERMISSIONS = {
  readFeedback: "feedback:read",
  readSharedOutcomes: "shared_outcomes:read",
  manageSharedOutcomesAccess: "shared_outcomes:manage_access",
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const AccessEmailSchema = z
  .object({ email: z.string().trim().email() })
  .strict();
export const AccessUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
});
export const AccessUsersSchema = z.object({ users: z.array(AccessUserSchema) });
