"use client";

import { Check, ListMinus, ListPlus } from "lucide-react";

// 付箋1枚の表示用コンポーネント。データ層には一切依存せず、位置(x, y)や
// 本文はすべてpropsで受け取り、変化はコールバックpropsで親へ通知するだけの
// コンポーネントにする。状態の保持・永続化・リアルタイム配信は呼び出し側の責務。
//
// 選択集合は親、本文編集は付箋が所有する。clickはpointerupで確定し、
// drag・Shift・工程コマンドと単一対象の編集を分ける。
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DRAG_THRESHOLD_PX, getNoteHeight } from "@/contracts/board";

import type { DotVoteKind } from "@/contracts/room-protocol";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import {
  type DotVoteRemaining,
  DotVoteSticker,
  type VoteDisplayMode,
} from "@/features/dot-vote";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import type { Note } from "../logic/notes-reducer";
import { StickyNote } from "./sticky-note";

export type NoteCardProps = {
  note: Note;
  authorName?: string;
  // 自分自身が現在ドラッグ中かどうか。trueの間は影を深くして「持ち上げた」見た目にする。
  isOwnDrag: boolean;
  isSelected: boolean;
  editingDisabled?: boolean;
  maxDisplayHeight?: number;
  interactionTool?: "select" | "hand";
  isMultiSelected?: boolean;
  isDecided?: boolean;
  isAdoptionFocused?: boolean;
  // WebSocket未接続時（connecting/closed）に親から渡す。true の間は選択・
  // ドラッグ・編集開始・削除を無効化する。room-client.send() は未openだと
  // メッセージを黙って破棄するため、UI操作自体を止めないと「入力したのに
  // サーバーへ届かず再接続後の snapshot で消える」体験になってしまう。
  disabled?: boolean;
  canEditNote: boolean;
  canDeleteNote: boolean;
  canMoveNote: boolean;
  canExcludeNote?: boolean;
  canRestoreNote?: boolean;
  candidatePending?: boolean;
  onSelect: (
    noteId: string,
    intent?: { shiftKey?: boolean; bringToFront?: boolean },
  ) => void;
  onDragStart: (
    noteId: string,
    event: React.PointerEvent<HTMLButtonElement>,
    origin?: { clientX: number; clientY: number },
  ) => void;
  onContentChange: (noteId: string, content: string) => void;
  draftValue?: string;
  onDraftChange?: (noteId: string, content: string) => void;
  onDraftCompositionStart?: (noteId: string) => void;
  onDraftCompositionEnd?: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onExclude?: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
  vote: {
    displayMode: VoteDisplayMode;
    selectedKind: DotVoteKind | null;
    voteRemaining: DotVoteRemaining;
    canVote: boolean;
    pendingOperations: ReadonlyArray<{
      noteId: string;
      kind: DotVoteKind;
      stickerId?: string;
    }>;
    onVote: (noteId: string, kind: DotVoteKind) => void;
    onVoteRemove: (noteId: string, kind: DotVoteKind) => void;
    onStickerRemove?: (stickerId: string) => void;
    onStickerDragStart?: (
      stickerId: string,
      kind: DotVoteKind,
      event: React.PointerEvent<HTMLButtonElement>,
    ) => void;
  };
  className?: string;
  style?: React.CSSProperties;
  autoFocusEditor?: boolean;
  onAutoFocusEditorComplete?: () => void;
};

type PointerOrigin = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  // pointerdown 時点で選択済みだったか。これが true の「移動なしクリック」を
  // 編集開始の合図にする。
  wasSelected: boolean;
  didDrag: boolean;
  shiftKey: boolean;
};

type CandidateActionPlacement = "top" | "bottom";

type FloatingPosition = {
  left: number;
  top: number;
  placement: CandidateActionPlacement;
};

type CandidateOverlayLayout = {
  action: FloatingPosition;
  anchor: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  menu: FloatingPosition;
};

type CandidateTouchActionOwner = {
  hide: () => void;
  noteId: string;
};

const CANDIDATE_ACTION_WIDTH_PX = 80;
const CANDIDATE_ACTION_HEIGHT_PX = 44;
const CANDIDATE_MENU_WIDTH_PX = 144;
const CANDIDATE_MENU_HEIGHT_PX = 48;
const VIEWPORT_EDGE_MARGIN_PX = 8;
const ACTION_SHOW_DELAY_MS = 150;
const ACTION_HIDE_DELAY_MS = 1_000;
const candidatePointerActionOwners = new WeakMap<Document, string>();
const candidateTouchActionOwners = new WeakMap<
  Document,
  CandidateTouchActionOwner
>();
const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getFloatingPosition(
  anchor: DOMRect,
  viewport: { height: number; width: number },
  floating: { height: number; width: number },
): FloatingPosition {
  const canFitBelow =
    anchor.bottom + floating.height <=
    viewport.height - VIEWPORT_EDGE_MARGIN_PX;
  const placement: CandidateActionPlacement = canFitBelow ? "bottom" : "top";
  const preferredTop =
    placement === "bottom" ? anchor.bottom : anchor.top - floating.height;

  return {
    left: clamp(
      anchor.left,
      VIEWPORT_EDGE_MARGIN_PX,
      viewport.width - floating.width - VIEWPORT_EDGE_MARGIN_PX,
    ),
    top: clamp(
      preferredTop,
      VIEWPORT_EDGE_MARGIN_PX,
      viewport.height - floating.height - VIEWPORT_EDGE_MARGIN_PX,
    ),
    placement,
  };
}

function isSameCandidateOverlayLayout(
  left: CandidateOverlayLayout | null,
  right: CandidateOverlayLayout,
): boolean {
  return (
    left?.action.left === right.action.left &&
    left.action.top === right.action.top &&
    left.action.placement === right.action.placement &&
    left.menu.left === right.menu.left &&
    left.menu.top === right.menu.top &&
    left.menu.placement === right.menu.placement &&
    left.anchor.left === right.anchor.left &&
    left.anchor.top === right.anchor.top &&
    left.anchor.width === right.anchor.width &&
    left.anchor.height === right.anchor.height
  );
}

function isPrintableCharacterKey(
  event: React.KeyboardEvent<HTMLButtonElement>,
): boolean {
  return (
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  );
}

function getNextTabbableElement(current: HTMLElement): HTMLElement | null {
  const candidates = Array.from(
    current.ownerDocument.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
  ).filter(
    (candidate) =>
      !candidate.hasAttribute("data-candidate-action") &&
      candidate.getAttribute("tabindex") !== "-1" &&
      candidate.getAttribute("aria-hidden") !== "true" &&
      candidate.closest("[hidden], [inert]") === null,
  );
  const currentIndex = candidates.indexOf(current);
  return currentIndex < 0 ? null : (candidates[currentIndex + 1] ?? null);
}

export function NoteCard({
  note,
  authorName,
  isOwnDrag,
  isSelected,
  editingDisabled = false,
  maxDisplayHeight = Number.POSITIVE_INFINITY,
  interactionTool = "select",
  isMultiSelected = false,
  isDecided = false,
  isAdoptionFocused = false,
  disabled = false,
  canEditNote,
  canDeleteNote,
  canMoveNote,
  canExcludeNote = false,
  canRestoreNote = false,
  candidatePending = false,
  onSelect,
  onDragStart,
  onContentChange,
  draftValue,
  onDraftChange,
  onDraftCompositionStart,
  onDraftCompositionEnd,
  onDelete,
  onExclude,
  onRestore,
  vote,
  className,
  style,
  autoFocusEditor = false,
  onAutoFocusEditorComplete,
}: NoteCardProps) {
  const [localContent, setLocalContent] = useState(draftValue ?? note.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isTouchActionVisible, setIsTouchActionVisible] = useState(false);
  const [isPointerActionVisible, setIsPointerActionVisible] = useState(false);
  const [isFocusActionVisible, setIsFocusActionVisible] = useState(false);
  const [candidateOverlayLayout, setCandidateOverlayLayout] =
    useState<CandidateOverlayLayout | null>(null);
  const wasEditingRef = useRef(false);
  const pointerOriginRef = useRef<PointerOrigin | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const candidateActionRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const compositionActiveRef = useRef(false);
  const blurDuringCompositionRef = useRef(false);
  const pointerOwnerDocumentRef = useRef<Document | null>(null);
  const touchOwnerDocumentRef = useRef<Document | null>(null);
  const pointerShowTimeoutRef = useRef<number | null>(null);
  const pointerHideTimeoutRef = useRef<number | null>(null);
  const focusHideTimeoutRef = useRef<number | null>(null);
  const canCandidateAction =
    !isMultiSelected && (note.excluded ? canRestoreNote : canExcludeNote);
  const candidateActionLabel = note.excluded ? "候補に戻す" : "候補から外す";
  const candidateActionText = note.excluded ? "戻す" : "除外";
  const isCandidateActionVisible =
    !isOwnDrag &&
    (isSelected ||
      isTouchActionVisible ||
      isPointerActionVisible ||
      isFocusActionVisible);

  const updateCandidateOverlayLayout = useCallback(() => {
    const anchor = noteRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const viewport = {
      height: window.innerHeight,
      width: window.innerWidth,
    };
    const nextLayout: CandidateOverlayLayout = {
      action: getFloatingPosition(anchor, viewport, {
        height: CANDIDATE_ACTION_HEIGHT_PX,
        width: CANDIDATE_ACTION_WIDTH_PX,
      }),
      anchor: {
        height: anchor.height,
        left: anchor.left,
        top: anchor.top,
        width: anchor.width,
      },
      menu: getFloatingPosition(anchor, viewport, {
        height: CANDIDATE_MENU_HEIGHT_PX,
        width: CANDIDATE_MENU_WIDTH_PX,
      }),
    };
    setCandidateOverlayLayout((current) =>
      isSameCandidateOverlayLayout(current, nextLayout) ? current : nextLayout,
    );
  }, []);

  const cancelPointerActionHide = useCallback(() => {
    if (pointerHideTimeoutRef.current === null) return;
    window.clearTimeout(pointerHideTimeoutRef.current);
    pointerHideTimeoutRef.current = null;
  }, []);

  const cancelPointerActionShow = useCallback(() => {
    if (pointerShowTimeoutRef.current === null) return;
    window.clearTimeout(pointerShowTimeoutRef.current);
    pointerShowTimeoutRef.current = null;
  }, []);

  const claimPointerAction = useCallback(
    (force = false): boolean => {
      const ownerDocument = noteRef.current?.ownerDocument;
      if (!ownerDocument) return false;
      const currentOwner = candidatePointerActionOwners.get(ownerDocument);
      if (!force && currentOwner !== undefined && currentOwner !== note.id) {
        return false;
      }
      candidatePointerActionOwners.set(ownerDocument, note.id);
      pointerOwnerDocumentRef.current = ownerDocument;
      return true;
    },
    [note.id],
  );

  const releasePointerAction = useCallback(() => {
    const ownerDocument =
      pointerOwnerDocumentRef.current ?? noteRef.current?.ownerDocument;
    if (
      ownerDocument &&
      candidatePointerActionOwners.get(ownerDocument) === note.id
    ) {
      candidatePointerActionOwners.delete(ownerDocument);
    }
    pointerOwnerDocumentRef.current = null;
  }, [note.id]);

  const hideTouchAction = useCallback(() => {
    setIsTouchActionVisible(false);
  }, []);

  const releaseTouchAction = useCallback(() => {
    const ownerDocument =
      touchOwnerDocumentRef.current ?? noteRef.current?.ownerDocument;
    if (
      ownerDocument &&
      candidateTouchActionOwners.get(ownerDocument)?.noteId === note.id
    ) {
      candidateTouchActionOwners.delete(ownerDocument);
    }
    touchOwnerDocumentRef.current = null;
  }, [note.id]);

  const showTouchAction = useCallback(() => {
    const ownerDocument = noteRef.current?.ownerDocument;
    if (!ownerDocument) return;
    const currentOwner = candidateTouchActionOwners.get(ownerDocument);
    if (currentOwner?.noteId !== note.id) currentOwner?.hide();
    candidateTouchActionOwners.set(ownerDocument, {
      hide: hideTouchAction,
      noteId: note.id,
    });
    touchOwnerDocumentRef.current = ownerDocument;
    setIsTouchActionVisible(true);
  }, [hideTouchAction, note.id]);

  const schedulePointerActionShow = useCallback(() => {
    cancelPointerActionShow();
    cancelPointerActionHide();
    updateCandidateOverlayLayout();
    const tryShow = () => {
      if (claimPointerAction()) {
        setIsPointerActionVisible(true);
        pointerShowTimeoutRef.current = null;
        return;
      }
      pointerShowTimeoutRef.current = window.setTimeout(
        tryShow,
        ACTION_SHOW_DELAY_MS,
      );
    };
    pointerShowTimeoutRef.current = window.setTimeout(
      tryShow,
      ACTION_SHOW_DELAY_MS,
    );
  }, [
    cancelPointerActionHide,
    cancelPointerActionShow,
    claimPointerAction,
    updateCandidateOverlayLayout,
  ]);

  const schedulePointerActionHide = useCallback(() => {
    cancelPointerActionShow();
    cancelPointerActionHide();
    pointerHideTimeoutRef.current = window.setTimeout(() => {
      setIsPointerActionVisible(false);
      releasePointerAction();
      pointerHideTimeoutRef.current = null;
    }, ACTION_HIDE_DELAY_MS);
  }, [cancelPointerActionHide, cancelPointerActionShow, releasePointerAction]);

  useEffect(() => {
    if (!isFocusActionVisible) return;
    const ownerDocument = noteRef.current?.ownerDocument;
    if (!ownerDocument) return;
    // 前面順のDOM移動でblurが届かない場合も、実際の次のfocusに追従する。
    const handleFocusIn = (event: FocusEvent) => {
      if (
        event.target !== surfaceRef.current &&
        event.target !== candidateActionRef.current
      )
        setIsFocusActionVisible(false);
    };
    ownerDocument.addEventListener("focusin", handleFocusIn);
    return () => ownerDocument.removeEventListener("focusin", handleFocusIn);
  }, [isFocusActionVisible]);

  const cancelFocusActionHide = useCallback(() => {
    if (focusHideTimeoutRef.current === null) return;
    window.clearTimeout(focusHideTimeoutRef.current);
    focusHideTimeoutRef.current = null;
  }, []);

  const scheduleFocusActionHide = useCallback(() => {
    cancelFocusActionHide();
    focusHideTimeoutRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement !== surfaceRef.current &&
        activeElement !== candidateActionRef.current
      ) {
        setIsFocusActionVisible(false);
      }
      focusHideTimeoutRef.current = null;
    }, 0);
  }, [cancelFocusActionHide]);

  // 他ユーザーの編集がWebSocket（RoomDO）経由で届いたら反映する。
  // ただし自分が編集モードの間は上書きしない
  // （タイピング中に他人の更新で巻き戻るのを防ぐ）。
  useEffect(() => {
    if (!isEditing) {
      setLocalContent(draftValue ?? note.content);
    }
  }, [note.content, draftValue, isEditing]);

  // 選択が外れたら編集モードも終了する（選択は編集の前提状態）。
  useEffect(() => {
    if (!isSelected || isMultiSelected) {
      setIsEditing(false);
    }
  }, [isSelected, isMultiSelected]);

  // 結果ステップへ切り替わりeditingDisabledになったら、編集中でも
  // 未送信の下書きを送らずに編集を強制終了する（disabledと同じ二重の安全策）。
  useEffect(() => {
    if (editingDisabled && isEditing) {
      setIsEditing(false);
      setLocalContent(note.content);
    }
  }, [editingDisabled, isEditing, note.content]);

  useEffect(() => {
    if (!canEditNote && isEditing) {
      setIsEditing(false);
      setLocalContent(note.content);
    }
  }, [canEditNote, isEditing, note.content]);

  useEffect(() => {
    if (isActionMenuOpen) menuItemRef.current?.focus();
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (canCandidateAction) return;
    cancelPointerActionHide();
    cancelPointerActionShow();
    setIsPointerActionVisible(false);
    releasePointerAction();
  }, [
    canCandidateAction,
    cancelPointerActionHide,
    cancelPointerActionShow,
    releasePointerAction,
  ]);

  useEffect(() => {
    if (note.excluded || canCandidateAction) return;
    hideTouchAction();
    releaseTouchAction();
  }, [canCandidateAction, hideTouchAction, note.excluded, releaseTouchAction]);

  useLayoutEffect(() => {
    if (canCandidateAction) updateCandidateOverlayLayout();
  }, [canCandidateAction, updateCandidateOverlayLayout]);

  useLayoutEffect(() => {
    if (
      !canCandidateAction ||
      (!isCandidateActionVisible && !isActionMenuOpen)
    ) {
      return;
    }
    updateCandidateOverlayLayout();

    const update = () => updateCandidateOverlayLayout();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (noteRef.current) observer?.observe(noteRef.current);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [
    canCandidateAction,
    isActionMenuOpen,
    isCandidateActionVisible,
    updateCandidateOverlayLayout,
  ]);

  useLayoutEffect(() => {
    if (canCandidateAction && (isCandidateActionVisible || isActionMenuOpen)) {
      updateCandidateOverlayLayout();
    }
  });

  useEffect(
    () => () => {
      cancelPointerActionHide();
      cancelPointerActionShow();
      cancelFocusActionHide();
      releasePointerAction();
      releaseTouchAction();
    },
    [
      cancelFocusActionHide,
      cancelPointerActionHide,
      cancelPointerActionShow,
      releasePointerAction,
      releaseTouchAction,
    ],
  );

  useEffect(() => {
    if (
      autoFocusEditor &&
      !isMultiSelected &&
      interactionTool === "select" &&
      isSelected &&
      canEditNote &&
      !editingDisabled &&
      !disabled
    ) {
      setIsEditing(true);
      onAutoFocusEditorComplete?.();
    }
  }, [
    autoFocusEditor,
    interactionTool,
    isMultiSelected,
    canEditNote,
    disabled,
    editingDisabled,
    isSelected,
    onAutoFocusEditorComplete,
  ]);

  const pendingVoteStickerIds = new Set(
    vote.pendingOperations
      .filter(({ stickerId }) => stickerId !== undefined)
      .map(({ stickerId }) => stickerId)
      .filter((stickerId): stickerId is string => stickerId !== undefined),
  );
  const pendingVoteKinds = vote.pendingOperations
    .filter(
      ({ noteId, stickerId }) => noteId === note.id && stickerId === undefined,
    )
    .map(({ kind }) => kind);
  const selectedStampKind =
    interactionTool === "select" &&
    !isMultiSelected &&
    vote.displayMode === "voting" &&
    vote.canVote &&
    vote.selectedKind !== null &&
    vote.voteRemaining[vote.selectedKind] > 0
      ? vote.selectedKind
      : null;

  // 状態に応じてフォーカスを移す。サーフェスにフォーカスがないと
  // Backspace削除などのキー操作を受け取れない。
  useEffect(() => {
    if (isEditing && isSelected) {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus({ preventScroll: true });
        const caret = textarea.value.length;
        textarea.setSelectionRange(caret, caret);
      }
    } else if (
      wasEditingRef.current &&
      isSelected &&
      document.activeElement === textareaRef.current
    ) {
      surfaceRef.current?.focus({ preventScroll: true });
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, isSelected]);

  const discardPointerOrigin = useCallback(() => {
    const origin = pointerOriginRef.current;
    pointerOriginRef.current = null;
    if (origin && surfaceRef.current?.hasPointerCapture?.(origin.pointerId))
      surfaceRef.current.releasePointerCapture(origin.pointerId);
  }, []);
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229)
        return;
      const press = pointerOriginRef.current;
      discardPointerOrigin();
      // privateの閾値前pressはtoolbarの選択解除より先に1段だけ取消す。
      if (
        press &&
        note.visibility === "private" &&
        event.target === surfaceRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("blur", discardPointerOrigin);
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => {
      window.removeEventListener("blur", discardPointerOrigin);
      window.removeEventListener("keydown", cancelOnEscape, true);
      discardPointerOrigin();
    };
  }, [discardPointerOrigin, note.visibility]);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (
      disabled ||
      event.defaultPrevented ||
      interactionTool === "hand" ||
      event.button !== 0 ||
      pointerOriginRef.current
    )
      return;
    if (selectedStampKind !== null) {
      event.preventDefault();
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerOriginRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      wasSelected: isSelected && !isMultiSelected,
      didDrag: false,
      shiftKey: event.shiftKey,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = pointerOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      pointerOriginRef.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (origin.didDrag) return;
    const distance = Math.hypot(
      event.clientX - origin.startClientX,
      event.clientY - origin.startClientY,
    );
    if (distance < DRAG_THRESHOLD_PX) return;
    // 移動が禁止でもdrag相当の動きをclick/editへ配送しない。
    origin.didDrag = true;
    if (!canMoveNote) return;
    if (!isSelected) onSelect(note.id, { bringToFront: false });
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onDragStart(note.id, event, {
      clientX: origin.startClientX,
      clientY: origin.startClientY,
    });
    pointerOriginRef.current = null;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = pointerOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    pointerOriginRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (origin.didDrag || disabled || interactionTool === "hand") return;
    event.currentTarget.focus({ preventScroll: true });
    onSelect(note.id, {
      shiftKey: origin.shiftKey,
      bringToFront: !origin.shiftKey,
    });
    if (
      event.pointerType === "touch" &&
      (note.excluded || canCandidateAction)
    ) {
      showTouchAction();
    }
    if (
      origin.wasSelected &&
      !origin.shiftKey &&
      canEditNote &&
      !editingDisabled
    ) {
      setIsEditing(true);
    }
  }

  function cancelPointer(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerOriginRef.current?.pointerId === event.pointerId) {
      pointerOriginRef.current = null;
    }
  }

  function performCandidateAction() {
    setIsActionMenuOpen(false);
    setIsTouchActionVisible(false);
    releaseTouchAction();
    setIsPointerActionVisible(false);
    releasePointerAction();
    if (disabled || candidatePending || isMultiSelected) return;
    onSelect(note.id);
    if (note.excluded) {
      if (canRestoreNote) onRestore?.(note.id);
      return;
    }
    if (canExcludeNote) onExclude?.(note.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (
      disabled ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Tab" && !event.shiftKey && canCandidateAction) {
      event.preventDefault();
      candidateActionRef.current?.focus();
      return;
    }
    if (event.shiftKey && event.key === "F10") {
      if (!canCandidateAction) return;
      event.preventDefault();
      event.stopPropagation();
      setIsActionMenuOpen(true);
      return;
    }
    if (interactionTool === "hand") {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onSelect(note.id);
      }
      return;
    }
    if (
      selectedStampKind !== null &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) vote.onVote(note.id, selectedStampKind);
      return;
    }
    // 付箋のSpaceは一時パン。native controls/editorとは分ける。
    if (event.code === "Space" || event.key === " ") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (isMultiSelected) return;
    const targetsNote =
      event.key === "Enter" ||
      event.key === "Delete" ||
      isPrintableCharacterKey(event);
    if (!targetsNote) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isSelected) {
      onSelect(note.id);
      return;
    }
    if (event.key === "Delete") {
      if (canDeleteNote && note.visibility === "private") onDelete(note.id);
      return;
    }
    if (!canEditNote || editingDisabled) return;
    if (isPrintableCharacterKey(event)) {
      const character = event.key;
      setLocalContent((content) =>
        content.length < NOTE_CONTENT_MAX_LENGTH
          ? `${content}${character}`
          : content,
      );
    }
    setIsEditing(true);
  }

  function handleContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    if (disabled || !canCandidateAction) return;
    event.preventDefault();
    setIsActionMenuOpen(true);
  }

  const candidateOverlay =
    canCandidateAction &&
    candidateOverlayLayout &&
    typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              aria-hidden="true"
              className={`pointer-events-none fixed z-[39] transition-opacity ${
                isCandidateActionVisible ? "opacity-100" : "opacity-0"
              }`}
              style={{
                height: candidateOverlayLayout.anchor.height,
                left: candidateOverlayLayout.anchor.left,
                top: candidateOverlayLayout.anchor.top,
                width: candidateOverlayLayout.anchor.width,
              }}
            >
              <span
                data-testid="candidate-target-corner"
                className="absolute left-0 top-0 size-3 border-blue-600 border-l-2 border-t-2"
              />
              <span
                data-testid="candidate-target-corner"
                className="absolute right-0 top-0 size-3 border-blue-600 border-r-2 border-t-2"
              />
              <span
                data-testid="candidate-target-corner"
                className="absolute bottom-0 left-0 size-3 border-blue-600 border-b-2 border-l-2"
              />
              <span
                data-testid="candidate-target-corner"
                className="absolute bottom-0 right-0 size-3 border-blue-600 border-b-2 border-r-2"
              />
            </div>
            <button
              ref={candidateActionRef}
              type="button"
              aria-label={candidateActionLabel}
              data-candidate-action="true"
              data-candidate-action-note-id={note.id}
              data-placement={candidateOverlayLayout.action.placement}
              disabled={disabled || candidatePending}
              aria-busy={candidatePending}
              tabIndex={isCandidateActionVisible ? 0 : -1}
              onPointerEnter={() => {
                cancelPointerActionShow();
                cancelPointerActionHide();
                claimPointerAction(true);
                setIsPointerActionVisible(true);
              }}
              onPointerLeave={schedulePointerActionHide}
              onFocus={() => {
                cancelFocusActionHide();
                setIsFocusActionVisible(true);
              }}
              onBlur={scheduleFocusActionHide}
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                if (event.shiftKey) {
                  event.preventDefault();
                  surfaceRef.current?.focus({ preventScroll: true });
                  return;
                }
                const surface = surfaceRef.current;
                if (!surface) return;
                const nextFocus = getNextTabbableElement(surface);
                if (!nextFocus) return;
                event.preventDefault();
                nextFocus.focus();
              }}
              onClick={(event) => {
                event.stopPropagation();
                performCandidateAction();
              }}
              className={`fixed z-40 flex items-center justify-center gap-1 rounded-l-md border border-red-200 bg-red-50 text-xs font-bold text-red-800 shadow-md transition-opacity [mask-image:radial-gradient(circle_at_right_center,transparent_0_6px,#000_7px)] ${
                isCandidateActionVisible
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
              style={{
                height: CANDIDATE_ACTION_HEIGHT_PX,
                left: candidateOverlayLayout.action.left,
                top: candidateOverlayLayout.action.top,
                WebkitMaskImage:
                  "radial-gradient(circle at right center, transparent 0 6px, black 7px)",
                width: CANDIDATE_ACTION_WIDTH_PX,
              }}
            >
              <span
                aria-hidden="true"
                data-candidate-action-seam="true"
                className={`pointer-events-none absolute left-0 h-[3px] w-7 ${
                  candidateOverlayLayout.action.placement === "bottom"
                    ? "-top-px"
                    : "-bottom-px"
                }`}
                style={{
                  backgroundColor:
                    NOTE_COLOR_STYLES[note.color].backgroundColor,
                  filter: note.excluded ? "grayscale(1)" : undefined,
                }}
              />
              {note.excluded ? (
                <ListPlus aria-hidden="true" className="size-4" />
              ) : (
                <ListMinus aria-hidden="true" className="size-4" />
              )}
              {candidatePending ? "処理中…" : candidateActionText}
            </button>
            {isActionMenuOpen ? (
              <div
                role="menu"
                aria-label="付箋の候補操作"
                className="fixed z-[41] min-w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                style={{
                  left: candidateOverlayLayout.menu.left,
                  top: candidateOverlayLayout.menu.top,
                  width: CANDIDATE_MENU_WIDTH_PX,
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || event.nativeEvent.isComposing)
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  setIsActionMenuOpen(false);
                  surfaceRef.current?.focus({ preventScroll: true });
                }}
              >
                <button
                  ref={menuItemRef}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    performCandidateAction();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-950 outline-none hover:bg-slate-100 focus:bg-slate-100"
                >
                  {note.excluded ? (
                    <ListPlus aria-hidden="true" className="size-4" />
                  ) : (
                    <ListMinus aria-hidden="true" className="size-4" />
                  )}
                  {candidateActionLabel}
                </button>
              </div>
            ) : null}
          </>,
          document.body,
        )
      : null;

  return (
    <StickyNote
      ref={noteRef}
      noteId={note.id}
      authorName={authorName}
      isLifted={isOwnDrag}
      isSelected={isSelected}
      isDecided={isDecided}
      isAdoptionFocused={isAdoptionFocused}
      color={note.color}
      height={Math.min(
        maxDisplayHeight,
        getNoteHeight(localContent, note.fontSize),
      )}
      testId="note-card"
      data-editing={isEditing || undefined}
      data-vote-drop-target={
        vote.displayMode === "voting" && vote.canVote ? true : undefined
      }
      data-excluded={note.excluded || undefined}
      className={`${className ?? "absolute"} group ${note.excluded ? "z-0" : "z-10"} ${
        note.excluded
          ? `${isSelected || isTouchActionVisible ? "opacity-90" : "opacity-45"} grayscale transition-opacity hover:opacity-90 focus-within:opacity-90`
          : ""
      }`}
      style={
        style ?? {
          left: note.x,
          top: note.y,
        }
      }
    >
      {candidateOverlay}
      {note.excluded ? (
        <span className="pointer-events-none absolute bottom-1 right-1 z-20 rounded-sm bg-white/90 px-1 py-0.5 text-[10px] font-semibold text-slate-700">
          候補外
        </span>
      ) : null}
      <textarea
        ref={textareaRef}
        value={localContent}
        readOnly={!isEditing || note.excluded}
        // サーバー（RoomDO）は上限超過を invalid-message で拒否するため、
        // UI 側でも同じコントラクト定数で「そもそも入力できない」形に塞ぐ。
        maxLength={NOTE_CONTENT_MAX_LENGTH}
        tabIndex={isEditing ? 0 : -1}
        onChange={(event) => {
          setLocalContent(event.target.value);
          onDraftChange?.(note.id, event.target.value);
        }}
        onCompositionStart={() => {
          compositionActiveRef.current = true;
          onDraftCompositionStart?.(note.id);
        }}
        onCompositionEnd={(event) => {
          compositionActiveRef.current = false;
          const composedText = event.currentTarget.value;
          onDraftCompositionEnd?.(note.id, composedText);
          if (blurDuringCompositionRef.current) {
            blurDuringCompositionRef.current = false;
            setTimeout(() => {
              const finalText = textareaRef.current?.value ?? composedText;
              onDraftChange?.(note.id, finalText);
              onContentChange(note.id, finalText);
              setIsEditing(false);
            }, 0);
          }
        }}
        onBlur={(event) => {
          // 共有操作停止後のblurは、回収済みの入力を盤面の表示値で上書きしない。
          // 入力はonChangeで下書き層へ渡してある。
          if (disabled) {
            setIsEditing(false);
            return;
          }
          if (compositionActiveRef.current) {
            blurDuringCompositionRef.current = true;
            onDraftChange?.(note.id, event.target.value);
            return;
          }
          setIsEditing(false);
          if (editingDisabled || !canEditNote || note.excluded) {
            return;
          }
          if (onDraftChange) onDraftChange(note.id, event.target.value);
          onContentChange(note.id, event.target.value);
        }}
        onKeyDown={(event) => {
          if (
            compositionActiveRef.current ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
          ) {
            event.stopPropagation();
            return;
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            // Escape はキャンセルではなく「編集の完了」（tldraw 踏襲）。
            // 編集終了でフォーカスがサーフェスへ移り、上の onBlur が発火して
            // 内容が確定する。誤操作で入力を失わせないための意図的な挙動。
            setIsEditing(false);
          }
        }}
        className={`min-h-0 flex-1 resize-none overflow-y-hidden bg-transparent px-2 pt-2 pr-10 text-slate-900 outline-none ${
          vote.displayMode === "result" ? "pb-2" : "pb-12"
        } ${isEditing ? "" : "pointer-events-none select-none"}`}
        style={{
          fontSize: `${note.fontSize}px`,
          lineHeight: `${Math.ceil(note.fontSize * 1.5)}px`,
        }}
        placeholder="メモを入力..."
      />
      {isDecided ? (
        <span
          role="status"
          aria-label="取り組む課題に決定済み"
          className="pointer-events-none absolute bottom-1 right-1 z-30 flex size-9 items-center justify-center rounded-full border-2 border-white bg-emerald-700 text-white shadow-lg"
        >
          <Check aria-hidden="true" className="size-5" strokeWidth={3} />
        </span>
      ) : null}
      {vote.displayMode === "result" ? (
        <div
          data-testid="note-vote-results"
          className={`pointer-events-none relative z-20 flex h-10 shrink-0 items-end gap-2 pb-2 pl-2 ${
            isDecided ? "pr-12" : "pr-2"
          }`}
        >
          <DotVoteSticker
            kind="subjective"
            count={note.dotVotes.subjective.count ?? 0}
            state="result"
          />
          <DotVoteSticker
            kind="objective"
            count={note.dotVotes.objective.count ?? 0}
            state="result"
          />
        </div>
      ) : null}
      {vote.displayMode === "voting" ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          {(note.dotVoteStickers.length > 0
            ? note.dotVoteStickers.map((sticker) => ({
                ...sticker,
                count: 1,
              }))
            : (["subjective", "objective"] as const)
                .filter((kind) => note.dotVotes[kind].ownCount > 0)
                .map((kind) => ({
                  id: `legacy-${kind}`,
                  kind,
                  x: kind === "subjective" ? 0.82 : 0.72,
                  y: 0.16,
                  count: note.dotVotes[kind].ownCount,
                }))
          ).map((sticker) => (
            <div
              key={sticker.id}
              data-vote-sticker-id={sticker.id}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${sticker.x * 100}%`,
                top: `${sticker.y * 100}%`,
              }}
            >
              <DotVoteSticker
                kind={sticker.kind}
                count={sticker.count}
                state={
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind)
                    ? "pending"
                    : "confirmed"
                }
                onRemove={
                  disabled ||
                  !vote.canVote ||
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind)
                    ? undefined
                    : sticker.id.startsWith("legacy-") ||
                        vote.onStickerRemove === undefined
                      ? () => vote.onVoteRemove(note.id, sticker.kind)
                      : () => vote.onStickerRemove?.(sticker.id)
                }
                onDragStart={
                  disabled ||
                  !vote.canVote ||
                  pendingVoteStickerIds.has(sticker.id) ||
                  pendingVoteKinds.includes(sticker.kind) ||
                  sticker.id.startsWith("legacy-")
                    ? undefined
                    : vote.onStickerDragStart === undefined
                      ? undefined
                      : (event) =>
                          vote.onStickerDragStart?.(
                            sticker.id,
                            sticker.kind,
                            event,
                          )
                }
              />
            </div>
          ))}
        </div>
      ) : null}
      {!isEditing && (
        // 選択・ドラッグ・キー操作を受ける透明なサーフェス。
        // button要素は対話的な子要素(textarea)を持てないため、カード全体を
        // buttonにせず、非編集時だけ本文の上に実buttonを重ねる。
        // 編集中はアンマウントされるので、ポインター操作もBackspaceも
        // 自然にtextarea側へ渡る。
        <button
          ref={surfaceRef}
          data-canvas-note-surface="true"
          type="button"
          aria-label={
            selectedStampKind === null
              ? note.excluded
                ? "候補外の付箋"
                : "付箋"
              : `付箋（${selectedStampKind === "subjective" ? "主観" : "客観"}シールを貼る）`
          }
          aria-pressed={isSelected}
          aria-disabled={disabled || undefined}
          aria-haspopup={canCandidateAction ? "menu" : undefined}
          aria-expanded={canCandidateAction ? isActionMenuOpen : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelPointer}
          onLostPointerCapture={cancelPointer}
          onPointerEnter={schedulePointerActionShow}
          onPointerLeave={schedulePointerActionHide}
          onFocus={() => {
            cancelFocusActionHide();
            setIsFocusActionVisible(true);
          }}
          onBlur={scheduleFocusActionHide}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          className={`absolute inset-0 z-10 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 ${
            disabled
              ? "cursor-not-allowed"
              : selectedStampKind !== null
                ? "cursor-none"
                : interactionTool === "hand"
                  ? "cursor-grab"
                  : isOwnDrag
                    ? "cursor-grabbing"
                    : "cursor-default"
          }`}
        />
      )}
    </StickyNote>
  );
}
