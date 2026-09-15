import type { DotVoteKind } from "@/contracts/room-protocol";

export type DotVoteRemaining = Record<DotVoteKind, number>;

export type VoteDisplayMode = "hidden" | "voting" | "result";

export type DotVoteFeedback = {
  state: "confirmed" | "failed";
  message: string;
};

export const DOT_VOTE_LABELS: Record<DotVoteKind, string> = {
  subjective: "主観",
  objective: "客観",
};

export function dotVoteRemainingLabel(
  kind: DotVoteKind,
  remaining: number,
): string {
  return `${DOT_VOTE_LABELS[kind]}シール 残り${remaining}票`;
}
