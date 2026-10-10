import { bindRoomEntryContinuation } from "@/features/auth";
import { rememberPendingRoomEntry } from "@/lib/room-client/entry-tab-storage";
import { getRoomEntryTabId } from "./room-entry-tab";
export async function entryDestination(
  href: string,
  roomId: string,
  admission?: string,
): Promise<string> {
  if (!admission) return href;
  const token = await bindRoomEntryContinuation(
    admission,
    roomId,
    getRoomEntryTabId(),
  );
  if (!token) throw new Error("入室を確認できませんでした。");
  rememberPendingRoomEntry(token);
  return `${href}${href.includes("?") ? "&" : "?"}entry=${encodeURIComponent(token)}`;
}
