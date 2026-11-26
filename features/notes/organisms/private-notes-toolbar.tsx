"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import toolMotion from "@/components/ui/tool-motion.module.css";
import {
  getNoteHeight,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_WIDTH,
} from "@/contracts/board";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { cn } from "@/lib/utils";
import type { Note } from "../logic/notes-reducer";
import { NoteCard } from "../molecules/note-card";
import { StickyNote } from "../molecules/sticky-note";

export type PrivateNotesToolbarProps = {
  rollbackRevision?: number;
  notes: Note[];
  exampleNotes?: readonly string[];
  disabled: boolean;
  editingDisabled?: boolean;
  canEditNote: boolean;
  className?: string;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
  selectedNoteId: string | null;
  canCreateNote: boolean;
  canDeleteNote: boolean;
  canMoveNote: boolean;
  sharingHint?: string;
  /** 共有できない操作を試している間、sharingHint を注意の面で強調する。 */
  sharingHintEmphasized?: boolean;
  presentation?: "dock" | "workspace";
  workspaceCollapsible?: boolean;
  workspaceExpanded?: boolean;
  onWorkspaceExpandedChange?: (expanded: boolean) => void;
  expandOnWorkspaceExit?: boolean;
  workspaceExitTransitionPending?: boolean;
  defaultExpanded?: boolean;
  expandRequest?: number;
  addRequest?: number;
  addActionRef?: React.RefObject<((content?: string) => void) | null>;
  noteCreationPending?: boolean;
  noteCreationReceipt?: { operationId: string; noteId: string };
  noteCreationFocusContext?: string;
  dropPlaceholder?: { noteId: string };
  onSelect: (noteId: string | null) => void;
  onAdd: (content?: string) => string | null;
  onContentChange: (noteId: string, content: string) => void;
  draftValue?: (noteId: string) => string | undefined;
  onDraftChange?: (noteId: string, content: string) => void;
  onDraftCompositionStart?: (noteId: string) => void;
  onDraftCompositionEnd?: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onDragStart: (
    noteId: string,
    event: React.PointerEvent<HTMLElement>,
    origin?: { clientX: number; clientY: number },
  ) => void;
};

// 参照情報を避けて列が5つ入らないときも、余りを左右に分けて入力欄と同じ中心に並べる。
const workspaceGrid =
  "max-w-[var(--private-notes-grid-width)] grid-cols-[repeat(auto-fill,var(--private-note-width))] justify-center-safe gap-x-[var(--private-note-column-gap)] gap-y-6";
const workspaceComposer =
  "mx-auto w-full max-w-[var(--private-note-composer-width)]";
const composerTextLayout =
  "col-start-1 row-start-1 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] px-4 py-4 text-base leading-6";

const workspaceWidths = {
  "--private-note-width": `${NOTE_WIDTH}px`,
  "--private-note-column-gap": "0.75rem",
  "--private-notes-grid-width":
    "calc(5 * var(--private-note-width) + 4 * var(--private-note-column-gap))",
  "--private-note-composer-width":
    "calc(3 * var(--private-note-width) + 2 * var(--private-note-column-gap))",
} as React.CSSProperties;

type ComposerNoteScroll = {
  targetTop: number;
  waitingNotes: Set<HTMLElement>;
  cancel: () => void;
};

type ComposerNoteMotion = {
  scroll: ComposerNoteScroll | null;
  animations: Set<Animation>;
};

function playComposerNoteEntrance(
  note: HTMLElement,
  x: number,
  y: number,
  animations?: Set<Animation>,
) {
  // 実カードを移動させ、最後は一覧上の位置に戻す。
  const animation = note.animate?.(
    [
      { transform: `translate(${x}px, ${y}px)`, opacity: 0.35 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 250, easing: "ease-out" },
  );
  if (animation && animations) {
    animations.add(animation);
    const forgetAnimation = () => {
      animations.delete(animation);
    };
    animation.onfinish = forgetAnimation;
    animation.oncancel = forgetAnimation;
  }
  return animation;
}

function revealComposerNoteWhileScrolling(
  note: HTMLElement,
  composer: HTMLTextAreaElement,
  scrollContainer: HTMLElement,
  targetTop: number,
  motion: ComposerNoteMotion,
) {
  const active = motion.scroll;
  const waitingNotes = active?.waitingNotes ?? new Set<HTMLElement>();
  waitingNotes.add(note);
  if (active?.targetTop === targetTop) return;
  active?.cancel();

  const startTop = scrollContainer.scrollTop;
  const scrollDistance = targetTop - startTop;
  const animatingNotes = new Map<HTMLElement, Animation>();
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let frame: number;
  let startedAt: number | undefined;
  const finish = () => {
    listeners.abort();
    for (const card of animatingNotes.keys()) {
      card.style.removeProperty("translate");
    }
    motion.scroll = null;
  };
  const cancel = () => {
    cancelAnimationFrame(frame);
    for (const animation of animatingNotes.values()) {
      if (motion.animations.delete(animation)) animation.cancel();
    }
    finish();
  };
  const animateVisibleNotes = () => {
    const clipTop =
      scrollContainer.getBoundingClientRect().top + scrollContainer.clientTop;
    const clipBottom = clipTop + scrollContainer.clientHeight;
    const scrollOffset = scrollContainer.scrollTop - targetTop;
    const translate = `0px ${scrollOffset}px`;
    // 一覧が動いている間も、付箋の着地点はスクロール後の位置に保つ。
    for (const card of animatingNotes.keys()) card.style.translate = translate;
    for (const waitingNote of waitingNotes) {
      if (!scrollContainer.contains(waitingNote)) {
        waitingNotes.delete(waitingNote);
        continue;
      }
      const bounds = waitingNote.getBoundingClientRect();
      if (bounds.top >= clipBottom || bounds.bottom <= clipTop) continue;
      const origin = composer.getBoundingClientRect();
      waitingNote.style.translate = translate;
      const animation = playComposerNoteEntrance(
        waitingNote,
        origin.left - bounds.left,
        origin.bottom - bounds.top - scrollOffset,
        motion.animations,
      );
      if (animation) {
        animatingNotes.set(waitingNote, animation);
      } else {
        waitingNote.style.removeProperty("translate");
      }
      waitingNotes.delete(waitingNote);
    }
  };
  const scrollFrame = (now: number) => {
    startedAt ??= now;
    const progress = Math.min((now - startedAt) / 200, 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    // 一覧と付箋の位置を同じフレームで更新して、着地点を固定する。
    scrollContainer.scrollTo({
      top: startTop + scrollDistance * easedProgress,
      behavior: "instant",
    });
    animateVisibleNotes();
    if (progress === 1) finish();
    else frame = requestAnimationFrame(scrollFrame);
  };

  motion.scroll = { targetTop, waitingNotes, cancel };
  scrollContainer.addEventListener("pointerdown", cancel, options);
  scrollContainer.addEventListener("wheel", cancel, {
    ...options,
    passive: true,
  });
  frame = requestAnimationFrame(scrollFrame);
}

function animateNoteFromComposer(
  note: HTMLElement,
  composer: HTMLTextAreaElement,
  scrollContainer: HTMLElement,
  motion?: ComposerNoteMotion,
) {
  if (scrollContainer.clientHeight === 0) return;

  const listViewportTop =
    scrollContainer.getBoundingClientRect().top + scrollContainer.clientTop;
  const bounds = note.getBoundingClientRect();
  const lastFullyVisibleTop =
    listViewportTop + scrollContainer.clientHeight - bounds.height;
  const visibleNoteTop = Math.max(
    listViewportTop,
    Math.min(bounds.top, lastFullyVisibleTop),
  );
  const scrollTop = scrollContainer.scrollTop;
  const targetTop = Math.max(
    0,
    Math.min(
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
      scrollTop + bounds.top - visibleNoteTop,
    ),
  );
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (Math.abs(targetTop - scrollTop) >= 1) {
    if (motion && !reduceMotion) {
      revealComposerNoteWhileScrolling(
        note,
        composer,
        scrollContainer,
        targetTop,
        motion,
      );
      return;
    }
    scrollContainer.scrollTop = targetTop;
  }
  if (reduceMotion) return;

  const origin = composer.getBoundingClientRect();
  const destination = note.getBoundingClientRect();
  playComposerNoteEntrance(
    note,
    origin.left - destination.left,
    origin.bottom - destination.top,
    motion?.animations,
  );
}

export function PrivateNotesToolbar({
  rollbackRevision = 0,
  notes,
  exampleNotes = [],
  disabled,
  editingDisabled = false,
  className,
  toolbarRef,
  selectedNoteId,
  canCreateNote,
  canDeleteNote,
  canMoveNote,
  sharingHint,
  sharingHintEmphasized = false,
  presentation = "dock",
  workspaceCollapsible = false,
  workspaceExpanded = false,
  onWorkspaceExpandedChange,
  expandOnWorkspaceExit = false,
  workspaceExitTransitionPending = false,
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
  const isWorkspace = presentation === "workspace";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const displayedExpanded = workspaceCollapsible
    ? workspaceExpanded
    : !canCreateNote || isExpanded;
  const isWritingCollapsed = workspaceCollapsible && !displayedExpanded;
  const lastEditedNoteIdRef = useRef<string | null>(null);
  const restoredWorkspaceRef = useRef(false);
  const previousPresentationRef = useRef(presentation);
  const pendingWorkspaceExitExpandRef = useRef(false);
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [newlyAddedNote, setNewlyAddedNote] = useState<{
    id: string;
    slideIn: boolean;
  } | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const composerHelpId = useId();
  const noteListId = useId();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerComposingRef = useRef(false);
  const pendingComposerCreationRef = useRef<{
    operationId: string;
    content: string;
  } | null>(null);
  const pendingCreationFocusRef = useRef<{
    operationId: string;
    generation: number;
    inputGeneration: number;
    context: string | undefined;
  } | null>(null);
  const interactionGenerationRef = useRef(0);
  const inputGenerationRef = useRef(0);
  const lastAddRequestRef = useRef(0);
  const pendingDeleteFocusRef = useRef<{
    id: string;
    index: number;
    surface: Element | null;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const composerNoteMotionRef = useRef<ComposerNoteMotion>({
    scroll: null,
    animations: new Set(),
  });
  const listRef = useRef<HTMLDivElement>(null);
  const previousNoteTopsRef = useRef(new Map<string, number>());
  const noteAnimationsRef = useRef(new Map<HTMLElement, Animation>());
  const noteOrderKey = JSON.stringify(notes.map((note) => note.id));

  useLayoutEffect(() => {
    const presentationChanged =
      previousPresentationRef.current !== presentation;
    if (presentationChanged) previousPresentationRef.current = presentation;
    if (presentation !== "dock" || !expandOnWorkspaceExit) {
      pendingWorkspaceExitExpandRef.current = false;
      return;
    }
    if (!presentationChanged && !pendingWorkspaceExitExpandRef.current) return;
    if (workspaceExitTransitionPending) {
      pendingWorkspaceExitExpandRef.current = true;
      return;
    }
    pendingWorkspaceExitExpandRef.current = false;
    const activeElement = document.activeElement;
    const isFocusedEditor =
      activeElement instanceof HTMLTextAreaElement &&
      toolbarRef?.current?.contains(activeElement) &&
      !activeElement.readOnly;
    if (!isFocusedEditor) setIsExpanded(true);
  }, [
    expandOnWorkspaceExit,
    presentation,
    toolbarRef,
    workspaceExitTransitionPending,
  ]);

  const handleAddWithContent = useCallback(
    (content?: string) => {
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
      const operationId = content === undefined ? onAdd() : onAdd(content);
      if (!operationId) return;
      pendingCreationFocusRef.current = {
        operationId,
        generation: interactionGenerationRef.current,
        inputGeneration: inputGenerationRef.current,
        context: noteCreationFocusContext,
      };
      setIsExpanded(true);
    },
    [
      disabled,
      canCreateNote,
      noteCreationPending,
      noteCreationFocusContext,
      onAdd,
      onContentChange,
    ],
  );

  const handleAdd = useCallback(
    () => handleAddWithContent(),
    [handleAddWithContent],
  );

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229 ||
        composerComposingRef.current
      )
        return;
      event.preventDefault();
      if (
        event.repeat ||
        event.altKey ||
        (event.ctrlKey && event.metaKey) ||
        !composerValue.trim() ||
        disabled ||
        !canCreateNote ||
        editingDisabled ||
        noteCreationPending
      )
        return;
      const operationId = onAdd(composerValue);
      if (!operationId) return;
      pendingComposerCreationRef.current = {
        operationId,
        content: composerValue,
      };
    },
    [
      canCreateNote,
      composerValue,
      disabled,
      editingDisabled,
      noteCreationPending,
      onAdd,
    ],
  );

  useLayoutEffect(() => {
    if (!addActionRef) return;
    addActionRef.current = handleAddWithContent;
    return () => {
      if (addActionRef.current === handleAddWithContent)
        addActionRef.current = null;
    };
  }, [addActionRef, handleAddWithContent]);

  useEffect(() => {
    const invalidateFocus = (event?: Event) => {
      if (
        event?.type === "input" ||
        event?.type === "compositionstart" ||
        event?.type === "compositionend"
      )
        inputGenerationRef.current += 1;
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
      pending.context !== noteCreationFocusContext ||
      disabled ||
      !canCreateNote ||
      editingDisabled ||
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open], details[open]',
      ) ||
      pending.inputGeneration !== inputGenerationRef.current
    )
      return;
    const scrollContainer = scrollContainerRef.current;
    const insertedNoteElement = Array.from(
      scrollContainer?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [],
    ).find((element) => element.dataset.noteId === insertedNote.id);
    const firstNoteElement =
      listRef.current?.querySelector<HTMLElement>("[data-note-id]");
    let slideIn = true;
    if (
      scrollContainer &&
      scrollContainer.clientHeight > 0 &&
      insertedNoteElement
    ) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const noteRect = insertedNoteElement.getBoundingClientRect();
      const visibleTop = containerRect.top + scrollContainer.clientTop;
      const visibleBottom = visibleTop + scrollContainer.clientHeight;
      const firstRowTop =
        firstNoteElement?.getBoundingClientRect().top ?? noteRect.top;
      const isFirstRow = Math.abs(noteRect.top - firstRowTop) < 1;
      slideIn =
        isFirstRow &&
        noteRect.top >= visibleTop &&
        noteRect.bottom <= visibleBottom;
    }
    setNewlyAddedNote({ id: insertedNote.id, slideIn });
    if (pending.generation !== interactionGenerationRef.current) return;
    setAutoFocusNoteId(insertedNote.id);
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

  useLayoutEffect(() => {
    if (!newlyAddedNote) return;

    const scrollContainer = scrollContainerRef.current;
    const insertedNote = Array.from(
      scrollContainer?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [],
    ).find((element) => element.dataset.noteId === newlyAddedNote.id);
    if (scrollContainer && insertedNote) {
      const prefersReducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      const behavior = prefersReducedMotion ? "auto" : "smooth";
      if (scrollContainer.clientHeight === 0) {
        // jsdomなどレイアウトを持たない環境では、従来通り要素の可視化APIを使う。
        insertedNote.scrollIntoView?.({ behavior, block: "nearest" });
      } else {
        const containerRect = scrollContainer.getBoundingClientRect();
        const noteRect = insertedNote.getBoundingClientRect();
        const visibleTop = containerRect.top + scrollContainer.clientTop;
        const visibleBottom = visibleTop + scrollContainer.clientHeight;
        const delta =
          noteRect.top < visibleTop
            ? noteRect.top - visibleTop
            : noteRect.bottom > visibleBottom
              ? noteRect.bottom - visibleBottom
              : 0;
        const currentScrollTop = scrollContainer.scrollTop;
        const maxScrollTop = Math.max(
          0,
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
        );
        const targetScrollTop = Math.min(
          maxScrollTop,
          Math.max(0, currentScrollTop + delta),
        );
        if (targetScrollTop !== currentScrollTop) {
          // 新しい付箋が見切れる分だけ動かす。表示済みの同じ行まで再スクロールしない。
          scrollContainer.scrollTo({ top: targetScrollTop, behavior });
        } else if (delta !== 0) {
          insertedNote.scrollIntoView?.({ behavior, block: "nearest" });
        }
      }
    }

    const animationTimer = window.setTimeout(() => {
      setNewlyAddedNote((currentNote) =>
        currentNote?.id === newlyAddedNote.id ? null : currentNote,
      );
    }, 200);
    return () => window.clearTimeout(animationTimer);
  }, [newlyAddedNote]);

  useEffect(() => {
    if (expandRequest > 0 && !workspaceCollapsible) setIsExpanded(true);
  }, [expandRequest, workspaceCollapsible]);

  useLayoutEffect(() => {
    if (!workspaceCollapsible) {
      restoredWorkspaceRef.current = false;
      return;
    }
    const editor =
      scrollContainerRef.current?.querySelector<HTMLTextAreaElement>(
        "textarea:not([readonly])",
      );
    let noteId = editor?.closest<HTMLElement>("[data-note-id]")?.dataset.noteId;
    if (!restoredWorkspaceRef.current && notes.length > 0) {
      const edited = notes
        .filter((note) => note.contentRevision > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const lastEditedId = notes.some(
        (note) => note.id === lastEditedNoteIdRef.current,
      )
        ? lastEditedNoteIdRef.current
        : null;
      noteId = noteId ?? lastEditedId ?? edited?.id;
      restoredWorkspaceRef.current = true;
    }
    const note = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [],
    ).find((element) => element.dataset.noteId === noteId);
    const keepNoteVisible = () => note?.scrollIntoView?.({ block: "nearest" });
    if (!workspaceExpanded || editor) keepNoteVisible();
    const scrollContainer = scrollContainerRef.current;
    if (
      workspaceExpanded ||
      !note ||
      !scrollContainer ||
      typeof ResizeObserver === "undefined"
    )
      return;
    // 縮小アニメーション中も、変わる表示範囲に合わせて編集中の付箋を追従させる。
    const observer = new ResizeObserver(keepNoteVisible);
    observer.observe(scrollContainer);
    return () => observer.disconnect();
  }, [workspaceCollapsible, workspaceExpanded, notes]);

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
      card?.querySelector<HTMLButtonElement>("button") ?? composerRef.current;
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
      // スクロールや追加アニメーションに影響されない、一覧内のレイアウト位置を読む。
      nextTops.set(noteId, element.offsetTop);
    }
    const previousTops = previousNoteTopsRef.current;
    const isAppend =
      nextTops.size > previousTops.size &&
      Array.from(previousTops.keys()).every(
        (id, index) => elements[index]?.dataset.noteId === id,
      );
    // geometryを全件readしてからanimationを開始し、各行のread/write反復を避ける。
    for (const element of elements) {
      const noteId = element.dataset.noteId;
      if (!noteId) continue;
      const top = nextTops.get(noteId);
      if (top === undefined) continue;
      const previousTop = previousTops.get(noteId);
      const delta = previousTop === undefined ? 0 : previousTop - top;
      if (!reduceMotion && !isAppend && delta !== 0) {
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

  useLayoutEffect(() => {
    if (!isWritingCollapsed) return;
    const motion = composerNoteMotionRef.current;
    return () => {
      motion.scroll?.cancel();
      // 一覧のスクロールより後に終わる付箋の移動も止める。
      for (const animation of motion.animations) animation.cancel();
      motion.animations.clear();
    };
  }, [isWritingCollapsed]);

  useLayoutEffect(() => {
    const pending = pendingComposerCreationRef.current;
    if (!pending || pending.operationId !== noteCreationReceipt?.operationId)
      return;
    const inserted = notes.find(
      (note) => note.id === noteCreationReceipt.noteId,
    );
    if (!inserted) return;
    pendingComposerCreationRef.current = null;

    const composer = composerRef.current;
    if (composer?.value.startsWith(pending.content)) {
      setComposerValue(composer.value.slice(pending.content.length));
    }

    const scrollContainer = scrollContainerRef.current;
    if (composer && scrollContainer && document.activeElement === composer) {
      const card = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>(
          '[data-testid="note-card"]',
        ) ?? [],
      ).find((element) => element.dataset.noteId === inserted.id);
      if (card) {
        animateNoteFromComposer(
          card,
          composer,
          scrollContainer,
          isWritingCollapsed ? composerNoteMotionRef.current : undefined,
        );
      }
    }
  }, [notes, noteCreationReceipt, isWritingCollapsed]);

  const headerLabels = (
    <div
      hidden={isWritingCollapsed}
      className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 sm:gap-y-1"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {canCreateNote ? (
          <CardTitle className="whitespace-nowrap font-normal text-sm/none md:text-base/none">
            マイ付箋
          </CardTitle>
        ) : null}
        {/* 共有前の付箋がほかの人に見えないことを、鍵の形と札で示す（#1085）。 */}
        <p className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          自分だけに表示
        </p>
      </div>
      {canCreateNote ? (
        <p
          id={composerHelpId}
          className="ms-auto text-right text-xs text-muted-foreground"
        >
          Enterで追加 · Shift+Enterで改行
        </p>
      ) : null}
    </div>
  );
  const composer = canCreateNote ? (
    <div
      className={cn(
        "grid w-full grid-rows-[minmax(0,1fr)] overflow-hidden rounded-md bg-muted/60 ring-1 ring-border/80 transition-[background-color,box-shadow] duration-150 focus-within:bg-background focus-within:outline-1 focus-within:outline-primary/70 focus-within:ring-4 focus-within:ring-primary/12 motion-reduce:transition-none",
        // 自分だけの欄は淡い面なので、入力欄は白で書く場所として浮かせる。
        isWorkspace && "bg-card",
        isWritingCollapsed
          ? "col-start-1 row-start-1 h-10 min-w-0"
          : "min-h-14 max-h-32",
        workspaceCollapsible && !isWritingCollapsed && "col-span-2 row-start-2",
        isWorkspace && !workspaceCollapsible && workspaceComposer,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(composerTextLayout, "invisible overflow-hidden")}
      >
        {/* 末尾の改行の後にも1行分の高さを確保する。 */}
        {`${composerValue}\u200b`}
      </div>
      <textarea
        ref={composerRef}
        aria-label="付箋を書く"
        aria-describedby={composerHelpId}
        autoCapitalize="sentences"
        data-private-note-composer="true"
        disabled={disabled || editingDisabled}
        maxLength={NOTE_CONTENT_MAX_LENGTH}
        onChange={(event) => {
          setComposerValue(event.currentTarget.value);
        }}
        onCompositionStart={() => {
          composerComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          composerComposingRef.current = false;
        }}
        onKeyDown={handleComposerKeyDown}
        placeholder="付箋を書く"
        rows={1}
        value={composerValue}
        className={cn(
          composerTextLayout,
          "size-full min-h-0 resize-none bg-transparent placeholder:text-muted-foreground focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          isWritingCollapsed && "px-3 py-2",
        )}
      />
    </div>
  ) : null;

  return (
    <Card
      ref={toolbarRef}
      className={cn(
        "flex max-w-full flex-col overflow-hidden transition-[box-shadow,background-color] duration-150",
        isWorkspace
          ? "h-full w-full max-w-7xl rounded-none border-0 bg-transparent shadow-none"
          : displayedExpanded
            ? cn(
                "w-[min(15rem,calc(100vw-1.5rem))]",
                !canCreateNote && notes.length === 0
                  ? "h-auto"
                  : "h-[min(48rem,calc(100vh-6rem))]",
              )
            : "h-auto w-[min(15rem,calc(100vw-1.5rem))]",
        className,
      )}
      style={isWorkspace ? workspaceWidths : undefined}
      data-testid="private-notes-toolbar"
      data-presentation={presentation}
      data-expanded={String(displayedExpanded)}
    >
      <CardHeader
        data-testid="private-notes-header"
        className={cn(
          "relative z-20 shrink-0",
          isWritingCollapsed
            ? "px-3 py-2"
            : isWorkspace
              ? "max-h-full gap-1 px-3 pt-1 pb-1 sm:gap-2 sm:pt-3 md:px-5 md:pt-4"
              : "gap-2 px-2 pt-3 pb-1",
        )}
      >
        {workspaceCollapsible ? (
          <div
            className={cn(
              workspaceComposer,
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2",
            )}
            data-testid="private-notes-controls"
          >
            {headerLabels}
            {composer}
            <Button
              type="button"
              variant="outline"
              aria-expanded={displayedExpanded}
              aria-controls={noteListId}
              className={cn(
                toolMotion.button,
                // 欄が淡い操作面なので、ボタンは白のまま枠の色で押せることを示す。
                "col-start-2 row-start-1 h-10 w-24 text-sm hover:border-primary/50 hover:bg-card aria-expanded:bg-card",
              )}
              onPointerDown={(event) => {
                const editor = document.activeElement;
                if (
                  event.button === 0 &&
                  editor instanceof HTMLTextAreaElement &&
                  !editor.readOnly &&
                  (editor === composerRef.current ||
                    scrollContainerRef.current?.contains(editor))
                )
                  event.preventDefault();
              }}
              onClick={() => onWorkspaceExpandedChange?.(!workspaceExpanded)}
            >
              {displayedExpanded ? (
                <ArrowDown aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
              {displayedExpanded ? "縮める" : "広げる"}
            </Button>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "flex shrink-0 items-center justify-between gap-2",
                isWorkspace && workspaceComposer,
              )}
              data-testid={canCreateNote ? "private-notes-controls" : undefined}
            >
              {headerLabels}
              {canCreateNote && !isWorkspace ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-expanded={displayedExpanded}
                  aria-label={`マイ付箋を${displayedExpanded ? "閉じる" : "開く"}`}
                  className={toolMotion.button}
                  onClick={() => setIsExpanded((expanded) => !expanded)}
                >
                  {displayedExpanded ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronUp aria-hidden="true" />
                  )}
                </Button>
              ) : null}
            </div>
            {composer}
          </>
        )}
        {!isWorkspace && sharingHint ? (
          <p
            role="status"
            // 強調の有無で高さを変えず、ドラッグ中の一覧の位置を保つ。
            className={cn(
              "-mx-2 rounded-md px-2 py-1 text-xs",
              sharingHintEmphasized
                ? "bg-warning-soft font-bold text-warning"
                : "text-muted-foreground",
            )}
          >
            {sharingHint}
          </p>
        ) : null}
      </CardHeader>
      <CardContent
        hidden={!isWorkspace && !displayedExpanded}
        className="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <section
          id={noteListId}
          ref={scrollContainerRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            isWorkspace
              ? cn(
                  "px-3 [scrollbar-gutter:stable] md:px-5",
                  isWritingCollapsed ? "py-2" : "pt-5 pb-3",
                )
              : "px-2 py-3",
          )}
          aria-label="マイ付箋一覧"
          data-testid="private-notes-scroll"
          onPointerDown={(event) => {
            if (
              workspaceCollapsible &&
              !workspaceExpanded &&
              !(event.target as HTMLElement).closest(
                "[data-testid='note-card'],[data-testid='private-note-placeholder'],button,input,textarea,[role='button']",
              )
            ) {
              // エリアを広げるだけの操作で、本文のフォーカスやIME変換を終わらせない。
              event.preventDefault();
            }
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (
              workspaceCollapsible &&
              !workspaceExpanded &&
              !target.closest(
                "[data-testid='note-card'],[data-testid='private-note-placeholder'],button,input,textarea,[role='button']",
              )
            ) {
              onWorkspaceExpandedChange?.(true);
              return;
            }
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
          {isWorkspace && !workspaceCollapsible && exampleNotes.length > 0 ? (
            <section
              aria-label="問いの例"
              className={cn("mb-6 grid", workspaceGrid)}
            >
              {exampleNotes.map((example, index) => (
                <StickyNote
                  key={example}
                  noteId={`example-note-${index}`}
                  color="blue"
                  height={getNoteHeight(example, NOTE_DEFAULT_FONT_SIZE)}
                  testId={`example-note-${index + 1}`}
                >
                  <div className="flex h-full flex-col p-2">
                    <p className="min-h-0 flex-1 whitespace-pre-wrap break-words text-base">
                      {example}
                    </p>
                  </div>
                </StickyNote>
              ))}
            </section>
          ) : null}
          <div
            ref={listRef}
            className={cn(
              "relative grid items-start",
              isWorkspace
                ? cn(workspaceGrid, !workspaceCollapsible && "pb-8")
                : "grid-cols-1 justify-items-center gap-3",
            )}
            data-testid="private-notes-list"
          >
            {notes.map((note) =>
              dropPlaceholder?.noteId === note.id ? (
                <div
                  key={note.id}
                  data-testid="private-note-placeholder"
                  data-note-id={note.id}
                  aria-hidden="true"
                  className="animate-in shrink-0 rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 fade-in duration-150"
                  style={{
                    width: NOTE_WIDTH,
                    height: getNoteHeight(note.content, note.fontSize),
                  }}
                />
              ) : (
                <ViewTransition
                  key={`${note.id}:${rollbackRevision}`}
                  name={`private-note-${note.id}`}
                  default="none"
                  share="private-note-morph"
                  update="private-note-morph"
                >
                  <NoteCard
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
                    onContentChange={(id, content) => {
                      lastEditedNoteIdRef.current = id;
                      onContentChange(id, content);
                    }}
                    draftValue={draftValue?.(note.id)}
                    onDraftChange={(id, content) => {
                      lastEditedNoteIdRef.current = id;
                      onDraftChange?.(id, content);
                    }}
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
                      // 一覧では投票を出さないので、シールの名前も表示されない。
                      phase: 1,
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
                      // 非表示の決定はんこが一覧の横スクロール範囲を広げないようにする。
                      "relative [&_[data-slot=sticky-note-stamp-layer]]:hidden",
                      newlyAddedNote?.id === note.id &&
                        newlyAddedNote.slideIn &&
                        "animate-in fade-in slide-in-from-bottom-2 duration-200",
                    )}
                  />
                </ViewTransition>
              ),
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
