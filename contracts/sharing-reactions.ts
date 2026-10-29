import { z } from "zod";
import type { RoomPhase } from "./phase";

export const SHARING_REACTION_KINDS = [
  "like",
  "clap",
  "surprised",
  "insight",
  "question",
] as const;
export const SharingReactionKindSchema = z.enum(SHARING_REACTION_KINDS);
export type SharingReactionKind = z.infer<typeof SharingReactionKindSchema>;
export const SHARING_REACTION_DURATION_MS = 3_000;
export const SHARING_REACTION_INTERVAL_MS = 400;
export const SHARING_REACTION_MAX_VISIBLE = 6;
export const SHARING_REACTION_MAX_PER_ACCOUNT = 3;

/** 課題・問い・アイデアの共有画面で、その場の反応だけをルーム全員へ届ける。 */
export function canSendSharingReaction(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.step === 2;
}
