import type { DotVoteKind } from "@/contracts/room-protocol";

export type DotVoteRemaining = Record<DotVoteKind, number>;

export type VoteDisplayMode = "hidden" | "voting" | "result";

export type DotVoteFeedback = {
  state: "confirmed" | "failed";
  message: string;
};

// 画面に出すシールの名前。内部の種別名（subjective / objective）とは対応だけを持ち、
// 種別名は保存データとプロトコルの互換のため変えない（ADR 0028）。
export const DOT_VOTE_LABELS = {
  subjective: "イチオシ！",
  objective: "需要ありそう",
} as const satisfies Record<DotVoteKind, string>;

// シールの種類を示す短いタグ。投票パレットのタグと、付箋の上のシールのツールチップで使う。
export const DOT_VOTE_KIND_TAGS = {
  subjective: "主観",
  objective: "客観",
} as const satisfies Record<DotVoteKind, string>;

// 投票基準の一文。名前と並べて示す場所（ステップガイド）で使う。
export const DOT_VOTE_CRITERIA = {
  subjective: "激しく共感する、取り組みたい",
  objective: "自分以外の人にも価値がありそう",
} as const satisfies Record<DotVoteKind, string>;

const DOT_VOTE_ALLOWANCE =
  `${DOT_VOTE_LABELS.subjective}1票・${DOT_VOTE_LABELS.objective}3票` as const;

export const DOT_VOTE_GUIDANCE = {
  target: "投票対象は現在のフェーズの個々の付箋です。",
  allowance: DOT_VOTE_ALLOWANCE,
  summary: `${DOT_VOTE_ALLOWANCE}を使い、現在のフェーズの個々の付箋へ投票します。`,
  operation: `${DOT_VOTE_ALLOWANCE}を、シールをドラッグするか選択して投票対象の付箋へ貼ります。`,
  withdrawal: "貼ったシールを押すと、投票を1票取り消せます。",
} as const;

export function dotVoteStickerName(kind: DotVoteKind): string {
  return `「${DOT_VOTE_LABELS[kind]}」シール`;
}

export function dotVoteRemainingLabel(
  kind: DotVoteKind,
  remaining: number,
): string {
  return `${dotVoteStickerName(kind)} 残り${remaining}票`;
}

// 付箋の上のシールに合わせたときの1行の説明。基準の一文はステップガイドで示すため含めない。
export function dotVoteStickerTooltip(kind: DotVoteKind): string {
  return `${DOT_VOTE_LABELS[kind]}（${DOT_VOTE_KIND_TAGS[kind]}）`;
}
