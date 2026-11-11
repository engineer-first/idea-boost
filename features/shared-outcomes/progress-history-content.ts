import type { ProgressHistoryEntry } from "@/contracts/shared-outcomes";
// 保存済み・反映待ちは普段どおりなので名前を出さない。
export const HISTORY_STATUS_LABELS: Partial<
  Record<ProgressHistoryEntry["saveStatus"], string>
> = {
  failed: "保存失敗",
  missing: "盤面なし・復元不可",
  open: "終了未記録",
};
export const HISTORY_STATUS_EXPLANATIONS = {
  saved: "正常に保存された盤面です。",
  pending: "この盤面はまだ表示できません。時間をおいて再取得してください。",
  failed: "保存に失敗しました。",
  missing:
    "盤面を保存できませんでした。後の盤面で補うことはありません。移行時刻は記録されています。",
  open: "この区間の終了は記録されていません。",
} as const;
export const HISTORY_ACTION_LABELS = {
  next: "通常移行",
  rollback: "直前のステップに戻る",
  "restart-writing": "書き足し",
  revote: "再投票",
  complete: "成果公開",
} as const;
export function formatHistoryDuration(entry: ProgressHistoryEntry): string {
  if (entry.enteredAt === null || entry.exitedAt === null) return "—";
  const seconds = Math.max(
    0,
    Math.floor((entry.exitedAt - entry.enteredAt) / 1000),
  );
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
export function formatHistoryTime(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
