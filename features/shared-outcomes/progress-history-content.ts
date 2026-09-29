import type { ProgressHistoryEntry } from "@/contracts/shared-outcomes";
export const HISTORY_STATUS_LABELS = {
  saved: "保存済み",
  pending: "反映待ち",
  failed: "反映失敗・自動再試行中",
  missing: "盤面なし・復元不可",
  open: "終了未記録",
} as const;
export const HISTORY_STATUS_EXPLANATIONS = {
  saved: "正常に保存された盤面です。",
  pending: "閲覧への反映を待っています。",
  failed: "保全した同じ記録を自動で再試行しています。",
  missing:
    "盤面を保存できませんでした。後の盤面で補うことはありません。移行時刻は記録されています。",
  open: "この区間の終了は記録されていません。",
} as const;
export const HISTORY_ACTION_LABELS = {
  next: "通常移行",
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
