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

export const DOT_VOTE_CRITERIA = {
  subjective: "主観は「激しく共感する、取り組みたい」。",
  objective: "客観は「自分以外の人にも価値がありそう」。",
} as const satisfies Record<DotVoteKind, string>;

export const DOT_VOTE_GUIDANCE = {
  target: "投票対象は現在のフェーズの個々の付箋です。",
  summary: "主観1票・客観3票を使い、現在のフェーズの個々の付箋へ投票します。",
  operation:
    "主観1票・客観3票を、シールをドラッグするか選択して投票対象の付箋へ貼ります。",
  withdrawal: "貼ったシールを押すと、投票を1票取り消せます。",
} as const;

export function dotVoteRemainingLabel(
  kind: DotVoteKind,
  remaining: number,
): string {
  return `${DOT_VOTE_LABELS[kind]}シール 残り${remaining}票`;
}
