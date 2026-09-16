"use client";

// 結果ステップで候補から外した付箋を確認・復元する一覧。
// 除外は削除ではないため、本文・色・票数・グループ帰属をこのカードに残し、
// 復元操作だけを RoomBoard のコールバックへ返す。
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersistentGroup } from "@/contracts/grouping";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import type { Note } from "../logic/notes-reducer";

export type ExcludedNotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: Note[];
  groups: PersistentGroup[];
  currentUserId: string;
  isHost: boolean;
  isDisconnected: boolean;
  onRestore: (noteId: string) => void;
};

export function ExcludedNotesDialog({
  open,
  onOpenChange,
  notes,
  groups,
  currentUserId,
  isHost,
  isDisconnected,
  onRestore,
}: ExcludedNotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto dark:bg-slate-950 dark:text-slate-50">
        <DialogHeader>
          <DialogTitle>除外した候補</DialogTitle>
          <DialogDescription>
            候補から外した付箋です。本文・投票・グループは保持されています。
          </DialogDescription>
        </DialogHeader>

        {notes.length === 0 ? (
          <p
            data-testid="excluded-notes-empty"
            className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
          >
            除外した候補はありません。
          </p>
        ) : (
          <ul
            data-testid="excluded-notes-list"
            className="grid gap-3 sm:grid-cols-2"
          >
            {notes.map((note) => {
              const noteGroups = groups.filter((group) =>
                group.noteIds.includes(note.id),
              );
              const canRestore = isHost || note.authorId === currentUserId;
              const subjective = note.dotVotes.subjective.count ?? 0;
              const objective = note.dotVotes.objective.count ?? 0;

              return (
                <li
                  key={note.id}
                  data-testid={`excluded-note-${note.id}`}
                  className="flex min-h-48 flex-col rounded-xl border border-slate-950/15 p-3 text-slate-950 shadow-sm"
                  style={{
                    backgroundColor:
                      NOTE_COLOR_STYLES[note.color].backgroundColor,
                  }}
                >
                  <p className="mb-2 flex-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {note.content || "無題の候補"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-950/15 pt-2 text-xs">
                    <span>投票 {subjective + objective}票</span>
                    <span>主観 {subjective}</span>
                    <span>客観 {objective}</span>
                    {noteGroups.length > 0 ? (
                      <span>
                        グループ:{" "}
                        {noteGroups.map((group) => group.name).join("・")}
                      </span>
                    ) : null}
                  </div>
                  {canRestore ? (
                    <button
                      type="button"
                      className="mt-3 min-h-10 rounded-lg border border-slate-950/20 bg-white/60 px-3 py-2 text-sm font-semibold transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDisconnected}
                      onClick={() => onRestore(note.id)}
                    >
                      元に戻す
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-slate-950/65">
                      作者またはホストが復元できます
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
