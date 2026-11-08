export type HmwHint = {
  readonly id: string;
  readonly word: string;
  readonly perspective: "誰" | "何" | "いつ" | "どこ" | "なぜ" | "どう";
  readonly template: string;
};

// 各組は異なる観点の3語。文型は語ごとに用意し、課題の活用・意味を推測しない。
export const HMW_HINT_GROUPS = [
  [
    {
      id: "resolve",
      word: "解消",
      perspective: "どう",
      template: "どうしたら、「{issue}」という困りごとを解消できるか？",
    },
    {
      id: "prevent",
      word: "先回り",
      perspective: "いつ",
      template: "どうしたら、「{issue}」という状況を前もって防げるか？",
    },
    {
      id: "cooperate",
      word: "助け合う",
      perspective: "誰",
      template:
        "どうしたら、周りの人と協力して「{issue}」という困りごとに対処できるか？",
    },
  ],
  [
    {
      id: "reduce",
      word: "減らす",
      perspective: "何",
      template: "どうしたら、「{issue}」が起きる回数を減らせるか？",
    },
    {
      id: "place",
      word: "場所を変える",
      perspective: "どこ",
      template: "「{issue}」に関係する場所を変えたら、何が変わるだろう？",
    },
    {
      id: "why",
      word: "そもそも",
      perspective: "なぜ",
      template: "そもそも、「{issue}」はなぜ困るのだろう？",
    },
  ],
  [
    {
      id: "replace",
      word: "置き換える",
      perspective: "どう",
      template:
        "「{issue}」に関係する行動や仕組みを別のものに置き換えたら、何が変わるだろう？",
    },
    {
      id: "time",
      word: "時間を変える",
      perspective: "いつ",
      template: "どうしたら、行動する時間を変えて「{issue}」に対処できるか？",
    },
    {
      id: "perspective",
      word: "立場を変える",
      perspective: "誰",
      template: "「{issue}」について、別の人の立場では何が変わるだろう？",
    },
  ],
  [
    {
      id: "divide",
      word: "分ける",
      perspective: "何",
      template:
        "どうしたら、「{issue}」という困りごとを小さく分けて取り組めるか？",
    },
    {
      id: "environment",
      word: "環境を変える",
      perspective: "どこ",
      template: "どうしたら、周りの環境を変えて「{issue}」に対処できるか？",
    },
    {
      id: "assumption",
      word: "当たり前を疑う",
      perspective: "なぜ",
      template: "「{issue}」について、当たり前だと思っていることは何だろう？",
    },
  ],
] as const satisfies readonly (readonly [HmwHint, HmwHint, HmwHint])[];

export function buildHmwHintQuestion(
  decidedIssue: string | null,
  hint: HmwHint,
): string | null {
  const issue = decidedIssue?.trim();
  if (!issue) return null;
  // 関数で置換し、課題中の $& や {issue} も通常の本文として保持する。
  return hint.template.replace("{issue}", () => issue);
}
