import { z } from "zod";

const InFlightSchema = z.object({
  operationId: z.string().uuid(),
  content: z.string(),
  expectedContentRevision: z.number().int().nonnegative(),
  expectedPhaseRevision: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative(),
});

export const NoteDraftSchema = z.object({
  noteId: z.string(),
  baseContent: z.string(),
  baseRevision: z.number().int().nonnegative(),
  text: z.string(),
  committedText: z.string(),
  generation: z.number().int().nonnegative(),
  composing: z.boolean(),
  inFlight: InFlightSchema.nullable(),
  recoveryReason: z
    .enum([
      "conflict",
      "not-editable",
      "missing",
      "interrupted-composition",
      "send-failed",
    ])
    .nullable(),
});
export type NoteDraft = z.infer<typeof NoteDraftSchema>;

const StoredDraftsSchema = z.object({
  version: z.literal(1),
  drafts: z.array(NoteDraftSchema),
});

export function noteDraftStorageKey(roomId: string, userId: string): string {
  return `idea-boost:note-drafts:v1:${userId}:${roomId}`;
}

export function loadNoteDrafts(key: string): {
  drafts: NoteDraft[];
  failureText: string | null;
} {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return { drafts: [], failureText: null };
    const parsed = StoredDraftsSchema.safeParse(JSON.parse(raw));
    if (parsed.success)
      return { drafts: parsed.data.drafts, failureText: null };
    return { drafts: [], failureText: raw };
  } catch {
    return { drafts: [], failureText: "保存領域を読み取れませんでした。" };
  }
}

export function persistNoteDrafts(
  key: string,
  drafts: readonly NoteDraft[],
): boolean {
  try {
    if (drafts.length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({ version: 1, drafts }));
    return true;
  } catch {
    return false;
  }
}
