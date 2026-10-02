import { z } from "zod";

export const PERMISSIONS = {
  readFeedback: "feedback:read",
  readSharedOutcomes: "shared_outcomes:read",
  manageSharedOutcomesAccess: "shared_outcomes:manage_access",
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// GUIで変更できるのは閲覧権限だけ。管理者資格はCLIで運用する。
export const ManagedReadPermissionSchema = z.enum([
  PERMISSIONS.readSharedOutcomes,
  PERMISSIONS.readFeedback,
]);
export type ManagedReadPermission = z.infer<typeof ManagedReadPermissionSchema>;

export const AccessEmailSchema = z
  .object({ email: z.string().trim().email() })
  .strict();
export const AccessUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
});
export const AccessUsersSchema = z.object({ users: z.array(AccessUserSchema) });
