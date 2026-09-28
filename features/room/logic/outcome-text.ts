export type RoomOutcome = {
  issue: string;
  hmw: string;
  idea: string;
};

export function formatOutcomeText(
  outcome: RoomOutcome,
  exportedAt: Date,
): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(exportedAt);
  return [
    "チームで決めた成果",
    `出力日: ${date}`,
    "",
    `1. 決定した課題\n${outcome.issue}`,
    "",
    `2. 決定した問い（HMW）\n${outcome.hmw}`,
    "",
    `3. 採用したアイデア\n${outcome.idea}`,
    "",
    "次に試すこと",
    "",
    "",
  ].join("\n");
}
