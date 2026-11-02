import { z } from "zod";

export const MEMBER_AVATAR_IDS = [
  "face-01",
  "face-02",
  "face-03",
  "face-04",
  "face-05",
  "face-06",
  "face-07",
  "face-08",
  "face-09",
  "face-10",
  "face-11",
  "face-12",
  "face-13",
  "face-14",
  "face-15",
  "face-16",
  "face-17",
  "face-18",
  "face-19",
  "face-20",
] as const;

export const MemberAvatarIdSchema = z.enum(MEMBER_AVATAR_IDS);
export type MemberAvatarId = z.infer<typeof MemberAvatarIdSchema>;
export const AvailableAvatarCountSchema = z
  .int()
  .min(0)
  .max(MEMBER_AVATAR_IDS.length);
