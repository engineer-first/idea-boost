import type { RoomPhase } from "@/contracts/phase";
import type { DotVoteKind } from "@/contracts/room-protocol";

export type DotVoteRemaining = Record<DotVoteKind, number>;

export type VoteDisplayMode = "hidden" | "voting" | "result";

export type DotVoteFeedback = {
  state: "confirmed" | "failed";
  message: string;
};

// 投票するフェーズ。1=課題、2=問い、3=アイデア。
export type DotVotePhase = 1 | 2 | 3;

// 画面に出すシールの名前。内部の種別名（subjective / objective）とは対応だけを持ち、
// 種別名は保存データとプロトコルの互換のため変えない（ADR 0028）。
// 「需要ありそう」はアイデアには合うが、課題・問いには合わないため、
// 課題・問いのフェーズでは「いいね」と呼ぶ。正本は docs/glossary.md。
const DOT_VOTE_LABELS_BY_PHASE = {
  1: { subjective: "イチオシ！", objective: "いいね" },
  2: { subjective: "イチオシ！", objective: "いいね" },
  3: { subjective: "イチオシ！", objective: "需要ありそう" },
} as const satisfies Record<DotVotePhase, Record<DotVoteKind, string>>;

// ロビーでは投票しないので、名前を引くときは課題フェーズとして扱う。
export function dotVotePhaseOf(phase: RoomPhase): DotVotePhase {
  return phase.kind === "step" ? phase.phase : 1;
}

export function dotVoteLabels(
  phase: DotVotePhase,
  locale: "ja" | "en" = "ja",
): Readonly<Record<DotVoteKind, string>> {
  if (locale === "en")
    return {
      subjective: "Top pick!",
      objective: phase === 3 ? "High potential" : "Like",
    };
  return DOT_VOTE_LABELS_BY_PHASE[phase];
}

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

export type DotVoteGuidance = {
  target: string;
  allowance: string;
  summary: string;
  operation: string;
  withdrawal: string;
};

export function dotVoteGuidance(
  phase: DotVotePhase,
  locale: "ja" | "en" = "ja",
): DotVoteGuidance {
  const labels = dotVoteLabels(phase, locale);
  if (locale === "en") {
    const allowance = `${labels.subjective}: 1 vote · ${labels.objective}: 3 votes`;
    return {
      target: "Vote on individual notes in the current phase.",
      allowance,
      summary: `Use ${allowance} to vote on individual notes in the current phase.`,
      operation: `Drag or select a sticker from ${allowance} and place it on a note.`,
      withdrawal: "Select a placed sticker to withdraw one vote.",
    };
  }
  const allowance = `${labels.subjective}1票・${labels.objective}3票`;
  return {
    target: "投票対象は現在のフェーズの個々の付箋です。",
    allowance,
    summary: `${allowance}を使い、現在のフェーズの個々の付箋へ投票します。`,
    operation: `${allowance}を、シールをドラッグするか選択して投票対象の付箋へ貼ります。`,
    withdrawal: "貼ったシールを押すと、投票を1票取り消せます。",
  };
}

export function dotVoteStickerName(
  kind: DotVoteKind,
  phase: DotVotePhase,
  locale: "ja" | "en" = "ja",
): string {
  const label = dotVoteLabels(phase, locale)[kind];
  return locale === "en" ? `${label} sticker` : `「${label}」シール`;
}

export function dotVoteRemainingLabel(
  kind: DotVoteKind,
  remaining: number,
  phase: DotVotePhase,
  locale: "ja" | "en" = "ja",
): string {
  return locale === "en"
    ? `${dotVoteStickerName(kind, phase, locale)} · ${remaining} votes left`
    : `${dotVoteStickerName(kind, phase, locale)} 残り${remaining}票`;
}

// 付箋の上のシールに合わせたときの1行の説明。基準の一文はステップガイドで示すため含めない。
export function dotVoteStickerTooltip(
  kind: DotVoteKind,
  phase: DotVotePhase,
  locale: "ja" | "en" = "ja",
): string {
  const label = dotVoteLabels(phase, locale)[kind];
  if (locale === "en")
    return `${label} · ${kind === "subjective" ? "Personal choice" : "Potential value"}`;
  return `${label}（${DOT_VOTE_KIND_TAGS[kind]}）`;
}
