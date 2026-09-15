import type { ProtocolMember, ServerMessage } from "@/contracts/room-protocol";

// note:move / 切断通知が欠落しても表示を残し続けないための安全弁。
// 通常はドラッグ中の note:drag（50ms間隔）で継続的に更新される。
export const REMOTE_NOTE_DRAG_TIMEOUT_MS = 3_000;

export type RemoteNoteDrag = {
  noteId: string;
  draggedBy: ProtocolMember;
  lastSeenAt: number;
};

export function applyRemoteNoteDragMessage(
  drags: RemoteNoteDrag[],
  message: ServerMessage,
  receivedAt = Date.now(),
): RemoteNoteDrag[] {
  switch (message.type) {
    case "note:drag": {
      const next = {
        noteId: message.noteId,
        draggedBy: message.draggedBy,
        lastSeenAt: receivedAt,
      };
      // 1ユーザーが同時に動かせる付箋は1枚。競合時は同じ付箋の最後の
      // 受信イベントを現在の移動者として扱う。
      return [
        ...drags.filter(
          (drag) =>
            drag.noteId !== message.noteId &&
            drag.draggedBy.userId !== message.draggedBy.userId,
        ),
        next,
      ];
    }
    case "note:updated":
      return drags.filter((drag) => drag.noteId !== message.note.id);
    case "note:deleted":
      return drags.filter((drag) => drag.noteId !== message.noteId);
    case "cursor:left":
    case "member_left":
      return drags.filter((drag) => drag.draggedBy.userId !== message.userId);
    case "cursor:updated":
      if (message.cursor.draggingNoteId === null) {
        return drags.filter(
          (drag) => drag.draggedBy.userId !== message.cursor.userId,
        );
      }
      return drags.filter(
        (drag) =>
          drag.draggedBy.userId !== message.cursor.userId ||
          drag.noteId === message.cursor.draggingNoteId,
      );
    case "snapshot":
    case "phase:updated":
      return [];
    default:
      return drags;
  }
}

export function removeExpiredRemoteNoteDrags(
  drags: RemoteNoteDrag[],
  now = Date.now(),
): RemoteNoteDrag[] {
  return drags.filter(
    (drag) => now - drag.lastSeenAt < REMOTE_NOTE_DRAG_TIMEOUT_MS,
  );
}
