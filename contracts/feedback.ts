import { z } from "zod";
import { ROOM_PHASE_STEP_LABELS } from "./phase";

export const FEEDBACK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// UUIDv7 の時刻は再送の鮮度判定だけに使い、保存期限はサーバー受信時刻から決める。
export const FEEDBACK_NEW_ID_WINDOW_MS = 24 * 60 * 60 * 1000;
export function createFeedbackId(now = Date.now()): string {
  const timestamp = now.toString(16).padStart(12, "0");
  const random = crypto.randomUUID();
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(15)}`;
}
export function isFreshFeedbackId(id: string, now: number): boolean {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return false;
  const issuedAt = Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
  return Math.abs(now - issuedAt) <= FEEDBACK_NEW_ID_WINDOW_MS;
}
export const FEEDBACK_BODY_LIMIT = 2000;
export const FEEDBACK_KINDS = {
  bug: "不具合",
  difficult: "使いにくい",
  unclear: "わからない",
  want: "ほしい",
  good: "よかった",
} as const;
export const FeedbackKindSchema = z.enum([
  "bug",
  "difficult",
  "unclear",
  "want",
  "good",
]);
export const FEEDBACK_TARGETS = [
  { value: "app", label: "アプリ全体" },
  ...Object.entries(ROOM_PHASE_STEP_LABELS).flatMap(([phase, steps]) =>
    Object.entries(steps).map(([step, label]) => ({
      value: `${phase}-${step}`,
      label,
    })),
  ),
  { value: "unknown", label: "ステップ不明" },
];
export const FeedbackTargetSchema = z
  .string()
  .refine(
    (value) => FEEDBACK_TARGETS.some((target) => target.value === value),
    "対象を選んでください。",
  );
const FeedbackFieldsSchema = z
  .object({
    id: z.guid(),
    target: FeedbackTargetSchema,
    kind: FeedbackKindSchema,
    body: z
      .string()
      .max(FEEDBACK_BODY_LIMIT)
      .transform((value) => value.trim()),
    rating: z.number().int().min(1).max(5).nullable(),
  })
  .strict();
export const FeedbackInputSchema = FeedbackFieldsSchema.refine(
  (value) => value.target === "app" || value.rating === null,
  "評価できる対象はアプリ全体です。",
);
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FeedbackRecordSchema = FeedbackFieldsSchema.extend({
  roomId: z.guid(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
});
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;
export const FeedbackListSchema = z.object({
  items: z.array(FeedbackRecordSchema),
  nextCursor: z.string().nullable(),
  canReadOutcomes: z.boolean(),
});
export type FeedbackList = z.infer<typeof FeedbackListSchema>;
export type FeedbackResult =
  | { ok: true; id: string }
  | { ok: false; error: string; retryWithNewId?: boolean };
export type SubmitFeedback = (
  roomId: string,
  input: FeedbackInput,
) => Promise<FeedbackResult>;
