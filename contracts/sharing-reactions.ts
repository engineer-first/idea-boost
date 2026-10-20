import { z } from "zod";
import type { RoomPhase } from "./phase";

export const SharingReactionKindSchema = z.literal("like");
export const SHARING_REACTION_DURATION_MS = 3_000;
export const SHARING_REACTION_INTERVAL_MS = 400;
export const SHARING_REACTION_MAX_VISIBLE = 6;
export const SHARING_REACTION_MAX_PER_ACCOUNT = 3;

/** 課題・問いの共有画面で、その場の反応だけをルーム全員へ届ける。 */
export function canSendSharingReaction(phase: RoomPhase): boolean {
  return phase.kind === "step" && phase.step === 2 && phase.phase !== 3;
}
