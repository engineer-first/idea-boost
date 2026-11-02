// ログアウト時は候補の検証なしで削除する。スキーマを使う読取・退出処理と分ける。
export const LAST_ROOM_STORAGE_KEY = "idea-boost:last-room";

export function clearStoredLastRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
  } catch {
    /* 利用できない保存領域に依存しない。 */
  }
}
