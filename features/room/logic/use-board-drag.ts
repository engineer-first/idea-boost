"use client";

// マイ付箋ツールバーとボードをまたぐドラッグの状態機械。
// private（ツールバー内）→ shared（ボードに入った瞬間 publish）→
// returning（自分の共有付箋をツールバーへ戻す = unpublish 待ち）を管理する。
// RoomDO の応答を待たずに表示を確定させるため、renderedNotes /
// renderedPrivateNotes として「表示用に畳み込んだ」配列を返す。
// DOM 参照はビューポートの矩形読み取りだけに限定し、JSX は持たない。
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import type { Note } from "@/features/notes";
import { type CanvasPoint, clampCanvasCoordinate } from "./canvas-camera";

const PRIVATE_LIST_AUTO_SCROLL_EDGE_PX = 56;
const PRIVATE_LIST_AUTO_SCROLL_MAX_PX_PER_FRAME = 8;

/**
 * ドラッグ中の付箋の状態と位置情報を保持する型。
 */
export type BoardDrag = {
  note: Note;
  pointerId: number;
  status: "private" | "shared" | "returning";
  privateDropIndex: number | null;
  x: number;
  y: number;
  grabOffsetX: number;
  grabOffsetY: number;
  clientX: number;
  clientY: number;
  previewOffsetX: number;
  previewOffsetY: number;
  previewWidth: number;
  previewHeight: number;
};

/**
 * useBoardDrag フックに引き渡す引数オプションの型。
 */
export type UseBoardDragArgs = {
  notes: Note[];
  privateNotes: Note[];
  currentUserId: string;
  boardScrollerRef: RefObject<HTMLDivElement | null>;
  worldPointFromClient: (
    clientX: number,
    clientY: number,
  ) => CanvasPoint | null;
  privateToolbarRef: RefObject<HTMLDivElement | null>;
  // 2軸マップは付箋の中心を座標で表すため、ツールバー内で掴んだ位置の差分を
  // 持ち込まず、ポインター位置そのものを配置点にする。
  preservePrivateGrabOffset?: boolean;
  // 通常キャンバスは広い連続座標、2軸マップは0〜100の連続座標とするため、
  // 配置先が座標系に応じた上限を渡す。
  clampCoordinate?: (coordinate: number) => number;
  // 共有済み付箋の移動を許可するか。公開（publish）の可否とは別に、
  // フェーズごとの既存付箋の移動権限を指定する。
  canMoveSharedNotes?: boolean;
  canPublish?: boolean;
  onPublishBlocked?: () => void;
  onNoteDragStart: (noteId: string) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onNoteDragCancel: (noteId: string) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onPrivateNoteUnpublish: (noteId: string, privateIndex: number) => void;
};

function applyPrivateOrder(source: Note[], order: string[]) {
  const noteById = new Map(source.map((note) => [note.id, note]));
  const ordered = order.flatMap((noteId) => {
    const note = noteById.get(noteId);
    if (!note) return [];
    noteById.delete(noteId);
    return [note];
  });
  return [...ordered, ...noteById.values()];
}

function sortPrivateNotes(source: Note[]): Note[] {
  return [...source].sort(
    (left, right) =>
      left.stackOrder - right.stackOrder ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function placePrivateNote(source: Note[], noteId: string, index: number) {
  const note = source.find((candidate) => candidate.id === noteId);
  if (!note) return source;
  const withoutNote = source.filter((candidate) => candidate.id !== noteId);
  const next = [...withoutNote];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, note);
  return next;
}

function getPositionFromPointer({
  pointerPosition,
  drag,
  preservePrivateGrabOffset,
  clampCoordinate,
}: {
  pointerPosition: CanvasPoint;
  drag: BoardDrag;
  preservePrivateGrabOffset: boolean;
  clampCoordinate: (coordinate: number) => number;
}): CanvasPoint {
  const preservesGrabOffset =
    drag.status === "shared" || preservePrivateGrabOffset;
  return {
    x: clampCoordinate(
      pointerPosition.x - (preservesGrabOffset ? drag.grabOffsetX : 0),
    ),
    y: clampCoordinate(
      pointerPosition.y - (preservesGrabOffset ? drag.grabOffsetY : 0),
    ),
  };
}

/**
 * ホワイトボードとマイ付箋ツールバー間の付箋ドラッグ状態を管理するカスタムフックです。
 *
 * @param args - フック設定オプション
 * @returns ドラッグ状態とポインターハンドラー
 */

export function useBoardDrag({
  notes,
  privateNotes,
  currentUserId,
  boardScrollerRef,
  worldPointFromClient,
  privateToolbarRef,
  preservePrivateGrabOffset = true,
  clampCoordinate = clampCanvasCoordinate,
  canMoveSharedNotes = true,
  canPublish = true,
  onPublishBlocked,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
  onNoteDragCancel,
  onPrivateNotePublish,
  onPrivateNoteUnpublish,
}: UseBoardDragArgs) {
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [privateOrder, setPrivateOrder] = useState<string[]>([]);
  const [pendingReturnedNotes, setPendingReturnedNotes] = useState<
    Record<string, Note>
  >({});
  // pointermove は React の再レンダーより速く連続発火するため、最新状態は
  // ref で参照する（state はレンダー反映用）。
  const dragRef = useRef<BoardDrag | null>(null);
  const hasNotifiedBlockedRef = useRef(false);
  const privateListScrollFrameRef = useRef<number | null>(null);
  const privateListScrollPointerRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const privateListScrollStepRef = useRef<() => void>(() => {});
  const orderedPrivateNotes = useMemo(
    () => sortPrivateNotes(privateNotes),
    [privateNotes],
  );

  const updateDrag = useCallback((next: BoardDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const stopPrivateListAutoScroll = useCallback(() => {
    privateListScrollPointerRef.current = null;
    const frameId = privateListScrollFrameRef.current;
    if (frameId === null) return;
    window.cancelAnimationFrame(frameId);
    privateListScrollFrameRef.current = null;
  }, []);

  const schedulePrivateListAutoScroll = useCallback(() => {
    if (privateListScrollFrameRef.current !== null) return;
    privateListScrollFrameRef.current = window.requestAnimationFrame(() => {
      privateListScrollFrameRef.current = null;
      privateListScrollStepRef.current();
    });
  }, []);

  useEffect(() => stopPrivateListAutoScroll, [stopPrivateListAutoScroll]);

  // 非公開へ戻す操作は RoomDO の応答で確定する。ただしドラッグ中は応答を
  // 待たずに、カードをポインターのある領域へ表示し直す。
  const renderedNotes =
    drag?.status === "returning"
      ? notes.filter((note) => note.id !== drag.note.id)
      : notes;
  const privateNotesWithPending = [
    ...orderedPrivateNotes,
    ...Object.values(pendingReturnedNotes).filter(
      (pending) => !privateNotes.some((note) => note.id === pending.id),
    ),
  ];
  const privateNotesWithReturning =
    drag?.status === "returning" &&
    !privateNotesWithPending.some((note) => note.id === drag.note.id)
      ? [
          { ...drag.note, visibility: "private" as const },
          ...privateNotesWithPending,
        ]
      : privateNotesWithPending;
  let renderedPrivateNotes = applyPrivateOrder(
    privateNotesWithReturning,
    privateOrder,
  );
  if (
    (drag?.status === "private" || drag?.status === "returning") &&
    drag.privateDropIndex !== null
  ) {
    renderedPrivateNotes = placePrivateNote(
      renderedPrivateNotes,
      drag.note.id,
      drag.privateDropIndex,
    );
  }

  useEffect(() => {
    setPendingReturnedNotes((pending) => {
      const confirmedIds = new Set(privateNotes.map((note) => note.id));
      const next = Object.fromEntries(
        Object.entries(pending).filter(([noteId]) => !confirmedIds.has(noteId)),
      );
      return Object.keys(next).length === Object.keys(pending).length
        ? pending
        : next;
    });
  }, [privateNotes]);

  const isPointerOverPrivateToolbar = useCallback(
    (clientX: number, clientY: number) => {
      const rect = privateToolbarRef.current?.getBoundingClientRect();
      return (
        rect !== undefined &&
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    [privateToolbarRef],
  );

  const boardPositionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const scroller = boardScrollerRef.current;
      if (!scroller) return null;
      const rect = scroller.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      return worldPointFromClient(clientX, clientY);
    },
    [boardScrollerRef, worldPointFromClient],
  );

  const privateDropIndexFromPointer = useCallback(
    (clientY: number, draggingNoteId: string) => {
      const toolbar = privateToolbarRef.current;
      const noteElements = toolbar?.querySelectorAll
        ? Array.from(
            toolbar.querySelectorAll<HTMLElement>(
              "[data-testid='note-card'][data-note-id]",
            ),
          ).filter((element) => element.dataset.noteId !== draggingNoteId)
        : [];
      if (noteElements.length > 0) {
        const index = noteElements.findIndex((element) => {
          const rect = element.getBoundingClientRect();
          return clientY < rect.top + rect.height / 2;
        });
        return index === -1 ? noteElements.length : index;
      }

      const rect = toolbar?.getBoundingClientRect();
      if (!rect) return 0;
      const height = Math.max(rect.bottom - rect.top, 1);
      return Math.min(
        privateNotes.length,
        Math.max(
          0,
          Math.round(((clientY - rect.top) / height) * privateNotes.length),
        ),
      );
    },
    [privateNotes.length, privateToolbarRef],
  );

  const trackPrivateListAutoScroll = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const scrollContainer =
        privateToolbarRef.current?.querySelector?.<HTMLElement>(
          "[data-testid='private-notes-scroll']",
        );
      const rect = scrollContainer?.getBoundingClientRect();
      if (
        !scrollContainer ||
        !rect ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        stopPrivateListAutoScroll();
        return;
      }

      privateListScrollPointerRef.current = { pointerId, clientX, clientY };
      schedulePrivateListAutoScroll();
    },
    [
      privateToolbarRef,
      schedulePrivateListAutoScroll,
      stopPrivateListAutoScroll,
    ],
  );

  privateListScrollStepRef.current = () => {
    const pointer = privateListScrollPointerRef.current;
    const current = dragRef.current;
    const scrollContainer =
      privateToolbarRef.current?.querySelector?.<HTMLElement>(
        "[data-testid='private-notes-scroll']",
      );
    if (
      !pointer ||
      !current ||
      current.pointerId !== pointer.pointerId ||
      (current.status !== "private" && current.status !== "returning") ||
      !scrollContainer
    ) {
      stopPrivateListAutoScroll();
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const edgeSize = Math.min(
      PRIVATE_LIST_AUTO_SCROLL_EDGE_PX,
      (rect.bottom - rect.top) / 2,
    );
    const distanceToTop = pointer.clientY - rect.top;
    const distanceToBottom = rect.bottom - pointer.clientY;
    const speed =
      distanceToTop < edgeSize
        ? -PRIVATE_LIST_AUTO_SCROLL_MAX_PX_PER_FRAME *
          (1 - distanceToTop / edgeSize)
        : distanceToBottom < edgeSize
          ? PRIVATE_LIST_AUTO_SCROLL_MAX_PX_PER_FRAME *
            (1 - distanceToBottom / edgeSize)
          : 0;
    if (speed === 0) {
      stopPrivateListAutoScroll();
      return;
    }

    const previousScrollTop = scrollContainer.scrollTop;
    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
    );
    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, previousScrollTop + speed),
    );
    if (nextScrollTop === previousScrollTop) {
      stopPrivateListAutoScroll();
      return;
    }

    scrollContainer.scrollTop = nextScrollTop;
    const nextIndex = privateDropIndexFromPointer(
      pointer.clientY,
      current.note.id,
    );
    if (current.privateDropIndex !== nextIndex) {
      updateDrag({ ...current, privateDropIndex: nextIndex });
    }
    schedulePrivateListAutoScroll();
  };

  const handleSharedNoteDragStart = useCallback(
    (noteId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canMoveSharedNotes) return;
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      hasNotifiedBlockedRef.current = false;
      boardScrollerRef.current?.setPointerCapture?.(event.pointerId);
      const pointerPosition = boardPositionFromPointer(
        event.clientX,
        event.clientY,
      );
      const rect = event.currentTarget?.getBoundingClientRect?.();
      updateDrag({
        note,
        pointerId: event.pointerId,
        status: "shared",
        privateDropIndex: null,
        x: note.x,
        y: note.y,
        grabOffsetX: pointerPosition ? pointerPosition.x - note.x : 0,
        grabOffsetY: pointerPosition ? pointerPosition.y - note.y : 0,
        clientX: event.clientX,
        clientY: event.clientY,
        previewOffsetX: rect ? event.clientX - rect.left : 0,
        previewOffsetY: rect ? event.clientY - rect.top : 0,
        previewWidth: rect?.width || NOTE_WIDTH,
        previewHeight: rect?.height || NOTE_HEIGHT,
      });
      onNoteDragStart(noteId);
    },
    [
      boardPositionFromPointer,
      notes,
      boardScrollerRef,
      canMoveSharedNotes,
      onNoteDragStart,
      updateDrag,
    ],
  );

  const handlePrivateDragStart = useCallback(
    (noteId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      // RoomDO の応答前でも、楽観表示中の付箋をそのまま掴み直せるようにする。
      const note = renderedPrivateNotes.find((n) => n.id === noteId);
      if (!note) return;
      hasNotifiedBlockedRef.current = false;
      boardScrollerRef.current?.setPointerCapture?.(event.pointerId);
      const rect = event.currentTarget?.getBoundingClientRect?.();
      const grabOffsetX = rect?.width
        ? ((event.clientX - rect.left) / rect.width) * NOTE_WIDTH
        : 0;
      const grabOffsetY = rect?.height
        ? ((event.clientY - rect.top) / rect.height) * NOTE_HEIGHT
        : 0;
      updateDrag({
        note,
        pointerId: event.pointerId,
        status: "private",
        privateDropIndex: renderedPrivateNotes.findIndex(
          (candidate) => candidate.id === noteId,
        ),
        x: note.x,
        y: note.y,
        grabOffsetX,
        grabOffsetY,
        clientX: event.clientX,
        clientY: event.clientY,
        previewOffsetX: rect ? event.clientX - rect.left : 0,
        previewOffsetY: rect ? event.clientY - rect.top : 0,
        previewWidth: rect?.width || NOTE_WIDTH,
        previewHeight: rect?.height || NOTE_HEIGHT,
      });
    },
    [renderedPrivateNotes, boardScrollerRef, updateDrag],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.status === "shared" && !canMoveSharedNotes) return;
      const currentAtPointer = {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (isPointerOverPrivateToolbar(event.clientX, event.clientY)) {
        if (
          current.status === "shared" &&
          current.note.authorId === currentUserId
        ) {
          // トレイへ重ねただけでは可視性を確定しない。共有ドラッグのロックだけ
          // 解放し、pointer-up までは returning のプレビューとして扱う。
          onNoteDragCancel(current.note.id);
          updateDrag({
            ...currentAtPointer,
            status: "returning",
            privateDropIndex: privateDropIndexFromPointer(
              event.clientY,
              current.note.id,
            ),
          });
          trackPrivateListAutoScroll(
            event.pointerId,
            event.clientX,
            event.clientY,
          );
        } else if (
          current.status === "private" ||
          current.status === "returning"
        ) {
          updateDrag({
            ...currentAtPointer,
            privateDropIndex: privateDropIndexFromPointer(
              event.clientY,
              current.note.id,
            ),
          });
          trackPrivateListAutoScroll(
            event.pointerId,
            event.clientX,
            event.clientY,
          );
        } else {
          stopPrivateListAutoScroll();
        }
        return;
      }

      stopPrivateListAutoScroll();
      const position = boardPositionFromPointer(event.clientX, event.clientY);
      if (!position) return;
      const nextPosition = getPositionFromPointer({
        pointerPosition: position,
        drag: current,
        preservePrivateGrabOffset,
        clampCoordinate,
      });
      if (current.status === "returning") {
        // トレイからボードへ戻ったので、共有付箋のドラッグを再開する。
        onNoteDragStart(current.note.id);
      }
      if (current.status === "private") {
        if (!canPublish) {
          if (!hasNotifiedBlockedRef.current) {
            onPublishBlocked?.();
            hasNotifiedBlockedRef.current = true;
          }
          updateDrag({
            ...currentAtPointer,
            status: "shared",
            ...nextPosition,
          });
          return;
        }
        // ボードに入った瞬間に共有化する。以後の座標は既存のdrag配信を使う。
        onPrivateNotePublish(current.note.id, nextPosition.x, nextPosition.y);
        onNoteDragStart(current.note.id);
      } else if (current.status !== "returning" && !canPublish) {
        updateDrag({ ...currentAtPointer, status: "shared", ...nextPosition });
        return;
      }
      // publish と同じ WebSocket 接続で送るため、publish のあとに届く drag は
      // RoomDO 側でも公開後の付箋として処理される。
      onNoteDragMove(current.note.id, nextPosition.x, nextPosition.y);
      updateDrag({
        ...currentAtPointer,
        status: "shared",
        ...nextPosition,
        // マイ付箋から2軸マップへ初めて出した後も、ドロップ確定時に
        // ツールバー由来の差分を再適用しない。
        ...(!preservePrivateGrabOffset && current.status !== "shared"
          ? { grabOffsetX: 0, grabOffsetY: 0 }
          : {}),
      });
    },
    [
      boardPositionFromPointer,
      canPublish,
      canMoveSharedNotes,
      clampCoordinate,
      currentUserId,
      isPointerOverPrivateToolbar,
      privateDropIndexFromPointer,
      stopPrivateListAutoScroll,
      trackPrivateListAutoScroll,
      onNoteDragMove,
      onNoteDragCancel,
      onNoteDragStart,
      onPrivateNotePublish,
      onPublishBlocked,
      preservePrivateGrabOffset,
      updateDrag,
    ],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      stopPrivateListAutoScroll();
      hasNotifiedBlockedRef.current = false;
      if (current.status === "shared") {
        if (canMoveSharedNotes) {
          const pointerPosition = boardPositionFromPointer(
            event.clientX,
            event.clientY,
          );
          const position = pointerPosition
            ? getPositionFromPointer({
                pointerPosition,
                drag: current,
                preservePrivateGrabOffset,
                clampCoordinate,
              })
            : { x: current.x, y: current.y };
          onNoteDragEnd(current.note.id, position.x, position.y);
        }
      } else if (current.privateDropIndex !== null) {
        const privateDropIndex = current.privateDropIndex;
        setPrivateOrder((order) =>
          placePrivateNote(
            applyPrivateOrder(
              current.status === "returning"
                ? [
                    ...orderedPrivateNotes,
                    { ...current.note, visibility: "private" as const },
                  ]
                : orderedPrivateNotes,
              order,
            ),
            current.note.id,
            privateDropIndex,
          ).map((note) => note.id),
        );
        if (current.status === "returning") {
          onPrivateNoteUnpublish(current.note.id, privateDropIndex);
          setPendingReturnedNotes((pending) => ({
            ...pending,
            [current.note.id]: {
              ...current.note,
              visibility: "private" as const,
            },
          }));
        }
      }
      boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
      updateDrag(null);
    },
    [
      boardPositionFromPointer,
      boardScrollerRef,
      canMoveSharedNotes,
      clampCoordinate,
      onNoteDragEnd,
      onPrivateNoteUnpublish,
      orderedPrivateNotes,
      preservePrivateGrabOffset,
      stopPrivateListAutoScroll,
      updateDrag,
    ],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      stopPrivateListAutoScroll();
      hasNotifiedBlockedRef.current = false;
      if (current.status === "shared") {
        onNoteDragCancel(current.note.id);
      }
      boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
      updateDrag(null);
    },
    [boardScrollerRef, onNoteDragCancel, stopPrivateListAutoScroll, updateDrag],
  );

  const cancelCurrentNoteDrag = useCallback(() => {
    const current = dragRef.current;
    stopPrivateListAutoScroll();
    if (current?.status !== "shared") return;
    hasNotifiedBlockedRef.current = false;
    onNoteDragCancel(current.note.id);
    boardScrollerRef.current?.releasePointerCapture?.(current.pointerId);
    updateDrag(null);
  }, [
    boardScrollerRef,
    onNoteDragCancel,
    stopPrivateListAutoScroll,
    updateDrag,
  ]);

  const isCurrentDragPointer = useCallback((pointerId: number) => {
    const current = dragRef.current;
    return current === null || current.pointerId === pointerId;
  }, []);

  return {
    drag,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel,
    cancelCurrentNoteDrag,
    isCurrentDragPointer,
  };
}
