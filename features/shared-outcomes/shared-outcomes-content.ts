export const PHASE_LABELS = ["課題", "問い", "アイデア"] as const;
// 保存の状態は利用者が動く必要がある失敗だけを出す。保存済み・反映待ちは出さない。
export const SAVE_FAILED_LABEL = "保存失敗";
export function formatOutcomeTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
