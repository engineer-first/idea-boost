"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNoteHeight } from "@/contracts/board";
import { cn } from "@/lib/utils";
import type { Note } from "../logic/notes-reducer";
import { NoteCard } from "../molecules/note-card";

export type PrivateNotesToolbarProps = {
  authorName?: (authorId: string) => string | undefined;
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
  sharingHint?: string;
  defaultExpanded?: boolean;
  expandRequest?: number;
  addRequest?: number;
  addActionRef?: React.RefObject<(() => void) | null>;
  noteCreationPending?: boolean;
  noteCreationReceipt?: { operationId: string; noteId: string };
  noteCreationFocusContext?: string;
  dropPlaceholder?: { noteId: string };
  onSelect: (noteId: string | null) => void;
  onAdd: () => string | null;
  onContentChange: (noteId: string, content: string) => void;
  draftValue?: (noteId: string) => string | undefined;
  onDraftChange?: (noteId: string, content: string) => void;
  onDraftCompositionStart?: (noteId: string) => void;
  onDraftCompositionEnd?: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onDragStart: (
    noteId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

export function PrivateNotesToolbar({
  notes,
  authorName,
  disabled,
  editingDisabled = false,
  className,
  toolbarRef,
  isReturnDropTarget = false,
  selectedNoteId,
  canCreateNote,
  canDeleteNote,
  canMoveNote,
  sharingHint,
  canEditNote,
  defaultExpanded = true,
  expandRequest = 0,
  addRequest = 0,
  addActionRef,
  noteCreationPending = false,
  noteCreationReceipt,
  noteCreationFocusContext,
  dropPlaceholder,
  onSelect,
  onAdd,
  onContentChange,
  draftValue,
  onDraftChange,
  onDraftCompositionStart,
  onDraftCompositionEnd,
  onDelete,
  onDragStart,
}: PrivateNotesToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [newlyAddedNoteId, setNewlyAddedNoteId] = useState<string | null>(null);
  const pendingCreationFocusRef = useRef<{
    operationId: string;
    generation: number;
    context: string | undefined;
  } | null>(null);
  const interactionGenerationRef = useRef(0);
  const lastAddRequestRef = useRef(0);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pendingDeleteFocusRef = useRef<{
    id: string;
    index: number;
    surface: Element | null;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousNoteTopsRef = useRef(new Map<string, number>());
  const noteAnimationsRef = useRef(new Map<HTMLElement, Animation>());
  const noteOrderKey = JSON.stringify(notes.map((note) => note.id));
  const handleAdd = useCallback(() => {
    if (disabled || !canCreateNote || noteCreationPending) return;
    const editor = document.activeElement;
    if (
      editor instanceof HTMLTextAreaElement &&
      !editor.readOnly &&
      scrollContainerRef.current?.contains(editor)
    ) {
      const noteId =
        editor.closest<HTMLElement>("[data-note-id]")?.dataset.noteId;
      if (noteId) onContentChange(noteId, editor.value);
    }
    const operationId = onAdd();
    if (!operationId) return;
    pendingCreationFocusRef.current = {
      operationId,
      generation: interactionGenerationRef.current,
      context: noteCreationFocusContext,
    };
    setIsExpanded(true);
  }, [
    disabled,
    canCreateNote,
    noteCreationPending,
    noteCreationFocusContext,
    onAdd,
    onContentChange,
  ]);

  useLayoutEffect(() => {
    if (!addActionRef) return;
    addActionRef.current = handleAdd;
    return () => {
      if (addActionRef.current === handleAdd) addActionRef.current = null;
    };
  }, [addActionRef, handleAdd]);

  useEffect(() => {
    const invalidateFocus = (event?: Event) => {
      if (
        event instanceof FocusEvent &&
        event.type === "focusout" &&
        event.target === addButtonRef.current &&
        addButtonRef.current?.disabled &&
        event.relatedTarget === null
      ) {
        // 作成待ちで＋を無効化した結果のblurは、本人が別の操作へ移った合図にしない。
        return;
      }
      interactionGenerationRef.current += 1;
    };
    const invalidateForKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Escape") invalidateFocus();
    };
    const events = [
      "input",
      "change",
      "compositionstart",
      "focusin",
      "focusout",
      "pointerdown",
    ] as const;
    for (const name of events)
      document.addEventListener(name, invalidateFocus, true);
    document.addEventListener("keydown", invalidateForKey, true);
    window.addEventListener("blur", invalidateFocus);
    return () => {
      for (const name of events)
        document.removeEventListener(name, invalidateFocus, true);
      document.removeEventListener("keydown", invalidateForKey, true);
      window.removeEventListener("blur", invalidateFocus);
    };
  }, []);

  useEffect(() => {
    const pending = pendingCreationFocusRef.current;
    if (!pending || pending.operationId !== noteCreationReceipt?.operationId)
      return;
    const insertedNote = notes.find(
      (note) => note.id === noteCreationReceipt.noteId,
    );
    if (!insertedNote) return;
    pendingCreationFocusRef.current = null;
    if (
      pending.generation !== interactionGenerationRef.current ||
      pending.context !== noteCreationFocusContext ||
      disabled ||
      !canCreateNote ||
      editingDisabled ||
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open], details[open]',
      )
    )
      return;
    setAutoFocusNoteId(insertedNote.id);
    setNewlyAddedNoteId(insertedNote.id);
    onSelect(insertedNote.id);
  }, [
    notes,
    noteCreationReceipt,
    noteCreationFocusContext,
    disabled,
    canCreateNote,
    editingDisabled,
    onSelect,
  ]);

  useEffect(() => {
    if (disabled || !canCreateNote || editingDisabled)
      pendingCreationFocusRef.current = null;
  }, [disabled, canCreateNote, editingDisabled]);

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

  useEffect(() => {
    if (addRequest <= 0 || addRequest === lastAddRequestRef.current) return;
    lastAddRequestRef.current = addRequest;
    handleAdd();
  }, [addRequest, handleAdd]);

  useLayoutEffect(() => {
    const pending = pendingDeleteFocusRef.current;
    if (!pending || notes.some((note) => note.id === pending.id)) return;
    pendingDeleteFocusRef.current = null;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.surface
    )
      return;
    const next = notes[Math.min(pending.index, notes.length - 1)];
    const card = next
      ? Array.from(
          listRef.current?.querySelectorAll<HTMLElement>("[data-note-id]") ??
            [],
        ).find((element) => element.dataset.noteId === next.id)
      : undefined;
    const target =
      card?.querySelector<HTMLButtonElement>("button") ?? addButtonRef.current;
    target?.focus({ preventScroll: true });
  }, [notes]);

  useLayoutEffect(() => {
    const elementsById = new Map<string, HTMLElement>();
    for (const element of Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [],
    )) {
      const noteId = element.dataset.noteId;
      if (noteId) elementsById.set(noteId, element);
    }
    const elements = (JSON.parse(noteOrderKey) as string[]).flatMap(
      (noteId) => {
        const element = elementsById.get(noteId);
        return element ? [element] : [];
      },
    );
    const nextTops = new Map<string, number>();
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    for (const element of elements) {
      const noteId = element.dataset.noteId;
      if (!noteId) continue;
      const top = element.getBoundingClientRect().top;
      nextTops.set(noteId, top);
    }
    // geometryを全件readしてからanimationを開始し、各行のread/write反復を避ける。
    for (const element of elements) {
      const noteId = element.dataset.noteId;
      if (!noteId) continue;
      const top = nextTops.get(noteId);
      if (top === undefined) continue;
      const previousTop = previousNoteTopsRef.current.get(noteId);
      const delta = previousTop === undefined ? 0 : previousTop - top;
      if (!reduceMotion && delta !== 0) {
        const animation = element.animate?.(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 160, easing: "ease-out" },
        );
        if (animation) {
          noteAnimationsRef.current.set(element, animation);
          animation.onfinish = () => {
            if (noteAnimationsRef.current.get(element) === animation) {
              noteAnimationsRef.current.delete(element);
            }
          };
        }
      }
    }
    previousNoteTopsRef.current = nextTops;
    return () => {
      // 並びが続けて変わった場合は前の FLIP を止めてから新しい位置を測る。
      for (const animation of noteAnimationsRef.current.values()) {
        animation.cancel();
      }
      noteAnimationsRef.current.clear();
    };
  }, [noteOrderKey]);

  return (
    <Card
      ref={toolbarRef}
      className={cn(
        "flex w-[min(15rem,calc(100vw-1.5rem))] max-w-full flex-col overflow-hidden transition-[box-shadow,background-color] duration-150",
        isReturnDropTarget && "bg-primary/5 ring-2 ring-primary/40",
        isExpanded ? "h-[min(48rem,calc(100vh-6rem))]" : "h-14",
        className,
      )}
      data-testid="private-notes-toolbar"
      data-expanded={String(isExpanded)}
      data-return-drop-target={isReturnDropTarget || undefined}
    >
      <CardContent
        hidden={!isExpanded}
        className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
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
            if (
              e.defaultPrevented ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return;
            if (e.key === "Escape") {
              e.stopPropagation();
              onSelect(null);
            }
          }}
        >
          <p
            className={cn(
              "text-xs text-muted-foreground",
              canCreateNote ? "mb-1" : "mb-3",
            )}
          >
            自分だけに見える付箋エリア
          </p>
          {canCreateNote ? (
            <p className="mb-3 text-xs text-muted-foreground">
              （付箋追加ショートカットキー：
              <br />
              Macは⌘＋Enter、Windows等はCtrl＋Enter）
            </p>
          ) : null}
          {sharingHint ? (
            <p role="status" className="mb-3 text-xs text-muted-foreground">
              {sharingHint}
            </p>
          ) : null}
          <div
            ref={listRef}
            className="grid grid-cols-1 justify-items-center gap-3"
            data-testid="private-notes-list"
          >
            {notes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                個人付箋はまだありません
              </p>
            ) : null}
            {notes.map((note) =>
              dropPlaceholder?.noteId === note.id ? (
                <div
                  key={note.id}
                  data-testid="private-note-placeholder"
                  data-note-id={note.id}
                  aria-hidden="true"
                  className="animate-in w-48 shrink-0 rounded-md border-2 border-primary/50 border-dashed bg-primary/5 fade-in duration-150"
                  style={{ height: getNoteHeight(note.content, note.fontSize) }}
                />
              ) : (
                <NoteCard
                  authorName={authorName?.(note.authorId)}
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
                  draftValue={draftValue?.(note.id)}
                  onDraftChange={onDraftChange}
                  onDraftCompositionStart={onDraftCompositionStart}
                  onDraftCompositionEnd={onDraftCompositionEnd}
                  onDelete={(id) => {
                    pendingDeleteFocusRef.current = {
                      id,
                      index: notes.findIndex((note) => note.id === id),
                      surface: document.activeElement,
                    };
                    onDelete(id);
                  }}
                  // 付箋の x/y はホワイトボード上の座標なので、一覧内では常に原点に置く。
                  style={{ left: 0, top: 0 }}
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
                />
              ),
            )}
          </div>
        </section>
      </CardContent>
      <CardFooter
        className={cn(
          "relative z-20 flex h-14 shrink-0 items-center bg-card p-3",
          isExpanded && "border-t border-border",
        )}
      >
        <div
          className="flex w-full items-center justify-between gap-2"
          data-testid="private-notes-controls"
        >
          <div className="min-w-0">
            <CardTitle className="whitespace-nowrap text-sm">
              マイ付箋
            </CardTitle>
          </div>
          <div className="flex w-fit shrink-0 items-center gap-2">
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    disabled={disabled || !canCreateNote || noteCreationPending}
                    ref={addButtonRef}
                    aria-label="付箋を追加"
                    onClick={handleAdd}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  付箋を追加（Macは⌘＋Enter、Windows等はCtrl＋Enter）
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        </div>
      </CardFooter>
    </Card>
  );
}
