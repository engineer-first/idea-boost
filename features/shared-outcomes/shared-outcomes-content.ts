export const PHASE_LABELS = ["課題", "問い", "アイデア"] as const;
export const SAVE_STATUS_LABELS = {
  saved: "保存済み",
  pending: "反映待ち",
  failed: "保存失敗",
} as const;
export function formatOutcomeTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
