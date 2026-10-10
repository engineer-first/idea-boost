const KEY = "idea-boost:room-entry-tab";
export function getRoomEntryTabId(): string {
  const saved = sessionStorage.getItem(KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(KEY, id);
  return id;
}
export function matchesRoomEntryTab(tabId: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === tabId;
  } catch {
    return false;
  }
}

// sessionStorage はタブ複製時にコピーされるので、継続情報の所有は文書内でも確認する。
// OAuthから戻った文書でbindし、同じSPA遷移だけに引き継ぐ。再読込は新しい入室。
const pendingRoomEntries = new Set<string>();
export function rememberPendingRoomEntry(token: string): void {
  pendingRoomEntries.add(token);
}
export function takePendingRoomEntry(token: string): boolean {
  return pendingRoomEntries.delete(token);
}
