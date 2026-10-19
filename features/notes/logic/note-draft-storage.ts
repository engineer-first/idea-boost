import { z } from "zod";
import { RoomPhaseSchema } from "@/contracts/phase";

const InFlightSchema = z.object({
  operationId: z.guid(),
  content: z.string(),
  expectedContentRevision: z.int().nonnegative(),
  expectedPhaseRevision: z.int().nonnegative(),
  generation: z.int().nonnegative(),
});

export const NoteDraftSchema = z.object({
  noteId: z.string(),
  baseContent: z.string(),
  baseRevision: z.int().nonnegative(),
  phaseRevision: z.int().nonnegative().optional(),
  phase: RoomPhaseSchema.optional(),
  text: z.string(),
  committedText: z.string(),
  generation: z.int().nonnegative(),
  composing: z.boolean(),
  inFlight: InFlightSchema.nullable(),
  recoveryReason: z
    .enum([
      "conflict",
      "not-editable",
      "missing",
      "interrupted-composition",
      "send-failed",
      "result-unknown",
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
    try {
      const parsed = StoredDraftsSchema.safeParse(JSON.parse(raw));
      if (parsed.success)
        return { drafts: parsed.data.drafts, failureText: null };
    } catch {
      // 解釈できなくても、読み取れた文章は手動回収のために残す。
    }
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
