import type { SharingReactionKind } from "@/contracts/sharing-reactions";
import type { SharingReactionDisplayProps } from "./sharing-reaction-display";

export function buildSharingReactionDisplayFixture(
  count = 1,
  kinds: readonly SharingReactionKind[] = ["like"],
): SharingReactionDisplayProps["reactions"] {
  return Array.from({ length: count }, (_, slot) => ({
    id: `preview-reaction-${slot}`,
    slot,
    kind: kinds[slot % kinds.length] ?? "like",
  }));
}
