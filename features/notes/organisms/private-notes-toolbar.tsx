"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Note } from "../logic/notes-reducer";
import { NoteCard } from "../molecules/note-card";

export type PrivateNotesToolbarProps = {
  notes: Note[];
  disabled: boolean;
  editingDisabled?: boolean;
  canEditNote: boolean;
  className?: string;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
  isReturnDropTarget?: boolean;
  selectedNoteId: string | null;
  canCreateNote: boolean;
  canDeleteNote: boolean;
  canMoveNote: boolean;
  defaultExpanded?: boolean;
  expandRequest?: number;
  onSelect: (noteId: string | null) => void;
  onAdd: () => void;
  onContentChange: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onDragStart: (
    noteId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

export function PrivateNotesToolbar({
  notes,
  disabled,
  editingDisabled = false,
  className,
  toolbarRef,
  isReturnDropTarget = false,
  selectedNoteId,
  canCreateNote,
  canDeleteNote,
  canMoveNote,
  canEditNote,
  defaultExpanded = true,
  expandRequest = 0,
  onSelect,
  onAdd,
  onContentChange,
  onDelete,
  onDragStart,
}: PrivateNotesToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [newlyAddedNoteId, setNewlyAddedNoteId] = useState<string | null>(null);
  const noteIdsBeforeAddRef = useRef<Set<string> | null>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const orderedNotes = [...notes].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  useEffect(() => {
    const noteIdsBeforeAdd = noteIdsBeforeAddRef.current;
    if (!noteIdsBeforeAdd) return;

    const insertedNote = notes.find((note) => !noteIdsBeforeAdd.has(note.id));
    if (!insertedNote) return;

    noteIdsBeforeAddRef.current = null;
    setAutoFocusNoteId(insertedNote.id);
    setNewlyAddedNoteId(insertedNote.id);
    onSelect(insertedNote.id);
  }, [notes, onSelect]);

  useEffect(() => {
    if (!newlyAddedNoteId) return;

    const insertedNote = Array.from(
      scrollContainerRef.current?.querySelectorAll<HTMLElement>(
        "[data-note-id]",
      ) ?? [],
    ).find((element) => element.dataset.noteId === newlyAddedNoteId);
    insertedNote?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });

    const animationTimer = window.setTimeout(() => {
      setNewlyAddedNoteId((currentId) =>
        currentId === newlyAddedNoteId ? null : currentId,
      );
    }, 200);
    return () => window.clearTimeout(animationTimer);
  }, [newlyAddedNoteId]);

  useEffect(() => {
    if (expandRequest > 0) setIsExpanded(true);
  }, [expandRequest]);

  function handleAdd() {
    noteIdsBeforeAddRef.current = new Set(notes.map((note) => note.id));
    setIsExpanded(true);
    onAdd();
  }

  return (
    <Card
      ref={toolbarRef}
      className={cn(
        "flex overflow-hidden",
        isExpanded
          ? "h-fit max-h-[min(48rem,calc(100vh-6rem))] w-60 flex-col"
          : "h-14 w-auto flex-col",
        className,
      )}
      data-testid="private-notes-toolbar"
      data-expanded={String(isExpanded)}
      data-return-drop-target={isReturnDropTarget || undefined}
    >
      {isExpanded ? (
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <section
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
            aria-label="マイ付箋一覧"
            data-testid="private-notes-scroll"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (!target.closest("[data-testid='note-card']")) {
                onSelect(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onSelect(null);
            }}
          >
            <div
              className="grid grid-cols-1 justify-items-center gap-3"
              data-testid="private-notes-list"
            >
              {notes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  個人付箋はまだありません
                </p>
              ) : null}
              {orderedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isOwnDrag={false}
                  isSelected={selectedNoteId === note.id}
                  disabled={disabled}
                  editingDisabled={editingDisabled}
                  canDeleteNote={canDeleteNote}
                  canEditNote={canEditNote}
                  canMoveNote={canMoveNote}
                  onSelect={onSelect}
                  onDragStart={onDragStart}
                  onContentChange={onContentChange}
                  onDelete={onDelete}
                  vote={{
                    displayMode: "hidden",
                    selectedKind: null,
                    voteRemaining: { subjective: 0, objective: 0 },
                    canVote: false,
                    pendingOperations: [],
                    onVote: () => {},
                    onVoteRemove: () => {},
                  }}
                  autoFocusEditor={autoFocusNoteId === note.id}
                  onAutoFocusEditorComplete={() => setAutoFocusNoteId(null)}
                  className={cn(
                    "relative",
                    newlyAddedNoteId === note.id &&
                      "animate-in fade-in slide-in-from-bottom-2 duration-200",
                  )}
                  style={{ width: "192px", height: "144px" }}
                />
              ))}
            </div>
          </section>
        </CardContent>
      ) : null}
      <CardFooter
        className={cn(
          "relative z-20 flex h-14 shrink-0 items-center bg-card p-3",
          isExpanded && "border-t border-border",
        )}
      >
        <div
          className="ml-auto flex w-fit items-center gap-2"
          data-testid="private-notes-controls"
        >
          <CardTitle className="whitespace-nowrap text-sm">マイ付箋</CardTitle>
          <Button
            type="button"
            size="icon-sm"
            disabled={disabled || !canCreateNote}
            aria-label="付箋を追加"
            onClick={handleAdd}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={isExpanded}
            aria-label={`マイ付箋を${isExpanded ? "閉じる" : "開く"}`}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
