export type HmwHint = {
  readonly id: string;
  readonly word: string;
  readonly perspective: "誰" | "何" | "いつ" | "どこ" | "なぜ" | "どう";
  readonly template: string;
};

// 各組は異なる観点の3語。文型は語ごとに用意し、課題の活用・意味を推測しない。
// 決定課題を差し込む型と、課題を直接含まない聞き取り型（インタビュー形式）がある。
export const HMW_HINT_GROUPS = [
  [
    {
      id: "enjoy",
      word: "楽しみ",
      perspective: "どう",
      template: "どうやったら{issue}を楽しめるだろう？",
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
      id: "motivation",
      word: "やる気",
      perspective: "どこ",
      template: "どこでやると一番捗る？",
    },
    {
      id: "reason",
      word: "理由",
      perspective: "なぜ",
      template: "なぜそんなに困るの？",
    },
  ],
  [
    {
      id: "avoid",
      word: "回避",
      perspective: "どう",
      template: "その困りごとをしなくても済む方法は？",
    },
    {
      id: "time",
      word: "時間を変える",
      perspective: "いつ",
      template: "どうしたら、行動する時間を変えて「{issue}」に対処できるか？",
    },
    {
      id: "standpoint",
      word: "立場",
      perspective: "誰",
      template: "誰に話すと楽？",
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
  // 聞き取り型は課題に依存しないので、課題がなくても文型のまま返す。
  if (!hint.template.includes("{issue}")) return hint.template;
  const issue = decidedIssue?.trim();
  if (!issue) return null;
  // 関数で置換し、課題中の $& や {issue} も通常の本文として保持する。
  return hint.template.replace("{issue}", () => issue);
}
