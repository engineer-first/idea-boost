import type { SharingReactionDisplayProps } from "./sharing-reaction-display";

export function buildSharingReactionDisplayFixture(
  count = 1,
): SharingReactionDisplayProps["reactions"] {
  return Array.from({ length: count }, (_, slot) => ({
    id: `preview-reaction-${slot}`,
    slot,
  }));
}
