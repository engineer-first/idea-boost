import type {
  CompletedScene,
  CompletedSceneKind,
} from "@/contracts/completed-rooms";
export const SCENE_LABELS: Record<CompletedSceneKind, string> = {
  "problem-grouping": "課題をグループ化したとき",
  "problem-decision": "課題を決めたとき",
  "question-decision": "問いを決めたとき",
  "idea-mapping": "アイデアを2軸に置いたとき",
  "idea-decision": "アイデアを決めたとき",
};
export const SCENE_STATUS: Record<CompletedScene["status"], string> = {
  saved: "保存済み",
  pending: "当時の記録の反映を待っています。時間をおいて再取得してください。",
  failed:
    "記録の反映に失敗したため、自動再試行中です。時間をおいて再取得してください。",
  missing: "記録を保存できず、この場面を見返せません。",
  "before-recording": "記録機能の導入前のため、この場面の記録はありません。",
};
export function formatCompletedDate(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
