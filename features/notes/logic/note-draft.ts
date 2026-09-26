import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";

export type NoteDraftScope = { roomId: string; userId: string };
export type NoteDraft = { baseContent: string; content: string };

function key(scope: NoteDraftScope, noteId: string): string {
  return `idea-boost:note-draft:${encodeURIComponent(scope.roomId)}:${encodeURIComponent(scope.userId)}:${encodeURIComponent(noteId)}`;
}

export function readNoteDraft(
  scope: NoteDraftScope,
  noteId: string,
): NoteDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key(scope, noteId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("baseContent" in parsed) ||
      typeof parsed.baseContent !== "string" ||
      !("content" in parsed) ||
      typeof parsed.content !== "string" ||
      parsed.content.length > NOTE_CONTENT_MAX_LENGTH
    )
      return null;
    return { baseContent: parsed.baseContent, content: parsed.content };
  } catch {
    return null;
  }
}

export function writeNoteDraft(
  scope: NoteDraftScope,
  noteId: string,
  draft: NoteDraft,
): void {
  try {
    window.sessionStorage.setItem(key(scope, noteId), JSON.stringify(draft));
  } catch {
    // Private browsing or storage quota can disable persistence; in-memory UI still retains it.
  }
}

export function removeNoteDraft(scope: NoteDraftScope, noteId: string): void {
  try {
    window.sessionStorage.removeItem(key(scope, noteId));
  } catch {
    // Storage can be unavailable.
  }
}
