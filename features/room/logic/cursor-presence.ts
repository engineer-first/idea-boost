import { isCursorSharingAllowed, type RoomPhase } from "@/contracts/phase";
import type { CursorPresence, ServerMessage } from "@/contracts/room-protocol";

export const CURSOR_SEND_INTERVAL_MS = 80;
export const CURSOR_IDLE_AFTER_MS = 3_000;

export type RemoteCursorPresence = CursorPresence & {
  // サーバー時計との差を持ち込まず、受信したクライアントの時計で idle を判定する。
  lastSeenAt: number;
};

export type RenderedRemoteCursorPresence = RemoteCursorPresence & {
  isIdle: boolean;
};

export function isCursorPresenceAllowed(phase: RoomPhase): boolean {
  return isCursorSharingAllowed(phase);
}

export function isRemoteCursorIdle(
  cursor: Pick<RemoteCursorPresence, "lastSeenAt">,
  now = Date.now(),
): boolean {
  return now - cursor.lastSeenAt >= CURSOR_IDLE_AFTER_MS;
}

export function applyCursorPresenceMessage(
  cursors: RemoteCursorPresence[],
  message: ServerMessage,
  currentUserId: string,
  currentPhase: RoomPhase,
  receivedAt = Date.now(),
): RemoteCursorPresence[] {
  if (message.type === "snapshot") {
    // presence は snapshot に含めず、再接続時に古い位置を復元しない。
    return [];
  }
  if (message.type === "phase:updated") {
    return isCursorSharingAllowed(message.phase) ? cursors : [];
  }
  if (message.type === "cursor:left" || message.type === "member_left") {
    return cursors.filter((cursor) => cursor.userId !== message.userId);
  }
  if (message.type !== "cursor:updated") return cursors;
  if (
    message.cursor.userId === currentUserId ||
    !isCursorSharingAllowed(currentPhase)
  ) {
    return cursors;
  }

  const next: RemoteCursorPresence = {
    ...message.cursor,
    lastSeenAt: receivedAt,
  };
  const index = cursors.findIndex(
    (cursor) => cursor.userId === message.cursor.userId,
  );
  if (index === -1) return [...cursors, next];
  return cursors.map((cursor, cursorIndex) =>
    cursorIndex === index ? next : cursor,
  );
}
