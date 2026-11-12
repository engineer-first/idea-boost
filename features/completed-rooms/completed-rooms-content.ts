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
  pending: "この場面はまだ表示できません。時間をおいて再取得してください。",
  failed: "この場面の保存に失敗しました。",
  missing: "記録を保存できず、この場面を見返せません。",
  "before-recording": "記録機能の導入前のため、この場面の記録はありません。",
};
export function formatCompletedDate(value: number): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeZone: "Asia/Tokyo",
  }).format(value);
  const time = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(value);
  return `${date} ${time}`;
}

export const COMPLETED_ROOMS_IDENTITY_ERROR =
  "本人情報を確認できないため、成果を表示できません。成果を残したときと同じブラウザで開いてください。";
export const COMPLETED_ROOMS_UNAVAILABLE_ERROR =
  "保存期限が過ぎたか、この成果を閲覧できる本人ではありません。";

export const COMPLETED_ROOMS_UNAVAILABLE_TITLE = "成果を表示できません";
export const COMPLETED_ROOMS_IDENTITY_CHOICE_MESSAGE =
  "Googleで使っていた場合はGoogleを選ぶと、この成果に戻れます。ゲストで新しく始めても、以前の成果は表示されません。";
export const COMPLETED_ROOMS_CHOICE_LABEL = "始め方を選ぶ";
