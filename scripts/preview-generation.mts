import { z } from "zod";

// 同じheadでも close→reopen は別の保存先として扱う。イベントの到着順を使わない。
export function previewGeneration(events: unknown[]): number {
  const reopened = z
    .array(
      z.object({
        id: z.number().int().positive().safe(),
        event: z.string(),
        created_at: z.string().datetime(),
      }),
    )
    .parse(events)
    .filter((event) => event.event === "reopened");
  reopened.sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
  );
  return reopened[0]?.id ?? 0;
}
