export type RoomOutcome = {
  issue: string;
  hmw: string;
  idea: string;
};

export function formatOutcomeText(
  outcome: RoomOutcome,
  exportedAt: Date,
  locale: "ja" | "en" = "ja",
): string {
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(exportedAt);
  return [
    locale === "en" ? "Team results" : "チームで決めた成果",
    `出力日: ${date}`,
    "",
    `${locale === "en" ? "1. Selected challenge" : "1. 決定した課題"}\n${outcome.issue}`,
    "",
    `${locale === "en" ? "2. Selected question" : "2. 決定した問い"}\n${outcome.hmw}`,
    "",
    `${locale === "en" ? "3. Selected idea" : "3. 採用したアイデア"}\n${outcome.idea}`,
    "",
    locale === "en" ? "What to try next" : "次に試すこと",
    "",
    "",
  ].join("\n");
}
