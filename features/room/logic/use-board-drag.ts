"use client";

// マイ付箋ツールバーとボードをまたぐドラッグの状態機械。
// private（本人だけのpreview。有効pointerupでpublish）→ shared →
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
import { getNoteHeight, NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import type { Note } from "@/features/notes";
import { type CanvasPoint, clampCanvasCoordinate } from "./canvas-camera";

const PRIVATE_LIST_AUTO_SCROLL_EDGE_PX = 56;
const PRIVATE_LIST_AUTO_SCROLL_OUTSIDE_EDGE_PX = 80;
const PRIVATE_LIST_AUTO_SCROLL_EDGE_SPEED_PX_PER_FRAME = 8;
const PRIVATE_LIST_AUTO_SCROLL_MAX_PX_PER_FRAME = 16;

function isPrivatePanelExpanded(toolbar: HTMLDivElement | null): boolean {
  return toolbar !== null && toolbar.dataset?.expanded !== "false";
}

function getPrivateListOutsideEdgeSpeed(distance: number): number {
  const progress = Math.min(
    distance / PRIVATE_LIST_AUTO_SCROLL_OUTSIDE_EDGE_PX,
    1,
  );
  return (
    PRIVATE_LIST_AUTO_SCROLL_EDGE_SPEED_PX_PER_FRAME +
    progress *
      (PRIVATE_LIST_AUTO_SCROLL_MAX_PX_PER_FRAME -
        PRIVATE_LIST_AUTO_SCROLL_EDGE_SPEED_PX_PER_FRAME)
  );
}

/**
 * ドラッグ中の付箋の状態と位置情報を保持する型。
 */
export type BoardDrag = {
  note: Note;
  targetIds?: readonly string[];
  pointerId: number;
  status: "private" | "shared" | "returning";
  canPublishAtStart?: boolean;
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
  selectedNoteIds?: readonly string[];
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
  canReturnToPrivate?: boolean;
  onPublishBlocked?: () => void;
  onNoteDragStart: (
    noteId: string,
    privateMapLock?: boolean,
    selectedNoteIds?: readonly string[],
  ) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onNoteDragCancel: (noteId: string) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onPrivateNoteUnpublish: (
    noteId: string,
    privateIndex: number,
    preserveDragUntilPointerEnd?: boolean,
  ) => void;
  // 3-2 で公開可能な private 付箋は pointerdown 時に先行 lock する。
  lockPrivateMapDrag?: boolean;
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
  selectedNoteIds,
  privateNotes,
  currentUserId,
  boardScrollerRef,
  worldPointFromClient,
  privateToolbarRef,
  preservePrivateGrabOffset = true,
  clampCoordinate = clampCanvasCoordinate,
  canMoveSharedNotes = true,
  canPublish = true,
  canReturnToPrivate = canPublish,
  onPublishBlocked,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
  onNoteDragCancel,
  onPrivateNotePublish,
  onPrivateNoteUnpublish,
  lockPrivateMapDrag = false,
}: UseBoardDragArgs) {
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [privateOrder, setPrivateOrder] = useState<string[]>([]);
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

  // 戻し先hoverは本人previewだけ。送信後のpending投影はuseNoteShareが結果まで所有する。
  const renderedNotes =
    drag?.status === "returning"
      ? notes.filter((note) => note.id !== drag.note.id)
      : notes;
  const privateNotesWithReturning =
    drag?.status === "returning" &&
    drag.privateDropIndex !== null &&
    !orderedPrivateNotes.some((note) => note.id === drag.note.id)
      ? [
          { ...drag.note, visibility: "private" as const },
          ...orderedPrivateNotes,
        ]
      : orderedPrivateNotes;
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

  const isPointerInPrivateDropArea = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPrivatePanelExpanded(privateToolbarRef.current)) return false;
      // 矩形内でも、最前面の別操作へdropした場合は戻しを確定しない。
      const hit = document.elementFromPoint?.(clientX, clientY);
      const hud = hit?.closest("[data-board-fit-edge]");
      const toolbar = privateToolbarRef.current;
      if (
        hit?.closest("[role='dialog'], [data-canvas-help]") ||
        (hud && !(toolbar instanceof Element && hud.contains(toolbar)))
      )
        return false;
      const rect = privateToolbarRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const current = dragRef.current;
      if ((current?.targetIds?.length ?? 0) > 1) return false;
      const isInsideToolbar =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      // トレイから出す private 付箋はゴースト本体がトレイに重なっても、
      // ポインターが実際にトレイ外ならボードへの移動として扱う。
      if (current?.status === "private") return isInsideToolbar;
      // 付箋本体が重なる範囲もドロップ先として認識する。判定だけを広げ、
      // ツールバーのDOMサイズや見た目には手を加えない（左側は従来どおり）。
      const top =
        rect.top -
        Math.max(
          0,
          (current?.previewHeight ?? 0) - (current?.previewOffsetY ?? 0),
        );
      const bottom = rect.bottom + Math.max(0, current?.previewOffsetY ?? 0);
      const right = rect.right + Math.max(0, current?.previewOffsetX ?? 0);
      return (
        clientX >= rect.left &&
        clientX <= right &&
        clientY >= top &&
        clientY <= bottom
      );
    },
    [privateToolbarRef],
  );

  const boardPositionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const scroller = boardScrollerRef.current;
      if (!scroller) return null;
      const hit = document.elementFromPoint?.(clientX, clientY);
      if (
        hit?.closest(
          "[data-board-fit-edge], [data-cursor-private='true'], [role='dialog'], [data-canvas-help]",
        )
      )
        return null;
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
        // 縦一覧はDOM順で単調。全件geometry readを避け、中点の二分探索で挿入先を求める。
        let low = 0;
        let high = noteElements.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          const rect = noteElements[middle].getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) high = middle;
          else low = middle + 1;
        }
        return low;
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
        clientY < rect.top - PRIVATE_LIST_AUTO_SCROLL_OUTSIDE_EDGE_PX ||
        clientY > rect.bottom + PRIVATE_LIST_AUTO_SCROLL_OUTSIDE_EDGE_PX
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
      distanceToTop < 0
        ? -getPrivateListOutsideEdgeSpeed(-distanceToTop)
        : distanceToTop < edgeSize
          ? -PRIVATE_LIST_AUTO_SCROLL_EDGE_SPEED_PX_PER_FRAME *
            (1 - distanceToTop / edgeSize)
          : distanceToBottom < 0
            ? getPrivateListOutsideEdgeSpeed(-distanceToBottom)
            : distanceToBottom < edgeSize
              ? PRIVATE_LIST_AUTO_SCROLL_EDGE_SPEED_PX_PER_FRAME *
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
    (
      noteId: string,
      event: ReactPointerEvent<HTMLButtonElement>,
      origin?: { clientX: number; clientY: number },
      requestedIds?: readonly string[],
    ) => {
      // 2本目の指で操作対象を上書きすると、最初の操作権を解放できなくなる。
      if (dragRef.current || !canMoveSharedNotes) return;
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      hasNotifiedBlockedRef.current = false;
      boardScrollerRef.current?.setPointerCapture?.(event.pointerId);
      const pointerPosition = boardPositionFromPointer(
        origin?.clientX ?? event.clientX,
        origin?.clientY ?? event.clientY,
      );
      const rect = event.currentTarget?.getBoundingClientRect?.();
      const selected = requestedIds ?? selectedNoteIds;
      const targetIds = selected?.includes(noteId) ? [...selected] : [noteId];
      updateDrag({
        note,
        targetIds,
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
      if (selected) onNoteDragStart(noteId, false, targetIds);
      else onNoteDragStart(noteId);
    },
    [
      boardPositionFromPointer,
      notes,
      selectedNoteIds,
      boardScrollerRef,
      canMoveSharedNotes,
      onNoteDragStart,
      updateDrag,
    ],
  );

  const handlePrivateDragStart = useCallback(
    (noteId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragRef.current || !isPrivatePanelExpanded(privateToolbarRef.current))
        return;
      // RoomDO の応答前でも、楽観表示中の付箋をそのまま掴み直せるようにする。
      const note = renderedPrivateNotes.find((n) => n.id === noteId);
      if (!note || note.excluded) return;
      hasNotifiedBlockedRef.current = false;
      boardScrollerRef.current?.setPointerCapture?.(event.pointerId);
      const rect = event.currentTarget?.getBoundingClientRect?.();
      const grabOffsetX = rect?.width
        ? ((event.clientX - rect.left) / rect.width) * NOTE_WIDTH
        : 0;
      const grabOffsetY = rect?.height
        ? ((event.clientY - rect.top) / rect.height) *
          getNoteHeight(note.content, note.fontSize)
        : 0;
      updateDrag({
        note,
        pointerId: event.pointerId,
        status: "private",
        canPublishAtStart: canPublish,
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
    [
      renderedPrivateNotes,
      boardScrollerRef,
      privateToolbarRef,
      updateDrag,
      canPublish,
    ],
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

      const canReturnSharedNote =
        current.status === "shared" &&
        current.note.authorId === currentUserId &&
        canReturnToPrivate;
      if (
        isPointerInPrivateDropArea(event.clientX, event.clientY) &&
        (current.status !== "shared" || canReturnSharedNote)
      ) {
        if (canReturnSharedNote) {
          // ドック上は挿入先の候補にすぎないため、pointer-up まで非公開化しない。
          // 3-2 の private map lock は pointer-up で非公開化した後に解除する。
          if (!lockPrivateMapDrag) {
            onNoteDragCancel(current.note.id);
          }
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
      if (!position) {
        if (current.status === "returning") {
          // ボードにもトレイにもいない間は、戻し先の候補を外す。
          // この領域で pointer-up しても誤って非公開化しない。
          updateDrag({ ...currentAtPointer, privateDropIndex: null });
        } else if (current.status === "private") {
          updateDrag({ ...currentAtPointer, privateDropIndex: null });
        }
        return;
      }
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
        if (!canPublish && !hasNotifiedBlockedRef.current) {
          onPublishBlocked?.();
          hasNotifiedBlockedRef.current = true;
        }
        updateDrag({
          ...currentAtPointer,
          ...nextPosition,
          privateDropIndex: null,
        });
        return;
      }
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
      canReturnToPrivate,
      canMoveSharedNotes,
      clampCoordinate,
      currentUserId,
      isPointerInPrivateDropArea,
      privateDropIndexFromPointer,
      stopPrivateListAutoScroll,
      trackPrivateListAutoScroll,
      onNoteDragMove,
      onNoteDragCancel,
      onNoteDragStart,
      onPublishBlocked,
      lockPrivateMapDrag,
      preservePrivateGrabOffset,
      updateDrag,
    ],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (
        (current.status === "private" || current.status === "returning") &&
        !isPrivatePanelExpanded(privateToolbarRef.current)
      ) {
        stopPrivateListAutoScroll();
        if (current.status === "returning" && lockPrivateMapDrag)
          onNoteDragCancel(current.note.id);
        updateDrag(null);
        boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
        return;
      }
      stopPrivateListAutoScroll();
      hasNotifiedBlockedRef.current = false;
      if (
        current.status === "private" &&
        !isPointerInPrivateDropArea(event.clientX, event.clientY)
      ) {
        const point = boardPositionFromPointer(event.clientX, event.clientY);
        if (canPublish && point && privateToolbarRef.current) {
          const position = getPositionFromPointer({
            pointerPosition: point,
            drag: current,
            preservePrivateGrabOffset,
            clampCoordinate,
          });
          onPrivateNotePublish(current.note.id, position.x, position.y);
        }
        updateDrag(null);
        boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
        return;
      }
      const isReturningDropTarget =
        current.status === "returning" &&
        isPointerInPrivateDropArea(event.clientX, event.clientY);
      if (current.status === "returning" && !isReturningDropTarget) {
        if (lockPrivateMapDrag) {
          onNoteDragCancel(current.note.id);
        }
        updateDrag(null);
        boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
        return;
      }
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
      } else {
        const privateDropIndex = isReturningDropTarget
          ? privateDropIndexFromPointer(event.clientY, current.note.id)
          : current.privateDropIndex;
        if (privateDropIndex !== null) {
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
            if (lockPrivateMapDrag && canReturnToPrivate) {
              onPrivateNoteUnpublish(current.note.id, privateDropIndex, true);
            } else {
              onPrivateNoteUnpublish(current.note.id, privateDropIndex);
            }
          }
        }
      }
      if (lockPrivateMapDrag && current.status === "returning") {
        onNoteDragCancel(current.note.id);
      }
      updateDrag(null);
      boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
    },
    [
      boardPositionFromPointer,
      boardScrollerRef,
      canMoveSharedNotes,
      clampCoordinate,
      isPointerInPrivateDropArea,
      onNoteDragEnd,
      onPrivateNoteUnpublish,
      onPrivateNotePublish,
      privateToolbarRef,
      orderedPrivateNotes,
      privateDropIndexFromPointer,
      onNoteDragCancel,
      lockPrivateMapDrag,
      canPublish,
      canReturnToPrivate,
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
      if (
        current.status === "shared" ||
        (lockPrivateMapDrag && current.status === "returning")
      ) {
        onNoteDragCancel(current.note.id);
      }
      updateDrag(null);
      boardScrollerRef.current?.releasePointerCapture?.(event.pointerId);
    },
    [
      boardScrollerRef,
      lockPrivateMapDrag,
      onNoteDragCancel,
      stopPrivateListAutoScroll,
      updateDrag,
    ],
  );

  const cancelCurrentNoteDrag = useCallback(
    (includePrivate = false) => {
      const current = dragRef.current;
      stopPrivateListAutoScroll();
      if (
        !current ||
        (!includePrivate && current.status === "private" && !lockPrivateMapDrag)
      )
        return;
      hasNotifiedBlockedRef.current = false;
      if (
        current.status === "shared" ||
        (lockPrivateMapDrag && current.status === "returning")
      )
        onNoteDragCancel(current.note.id);
      updateDrag(null);
      boardScrollerRef.current?.releasePointerCapture?.(current.pointerId);
    },
    [
      boardScrollerRef,
      lockPrivateMapDrag,
      onNoteDragCancel,
      stopPrivateListAutoScroll,
      updateDrag,
    ],
  );

  const hasPrivatePreview =
    drag?.status === "private" || drag?.status === "returning";
  useEffect(() => {
    if (
      !canPublish &&
      dragRef.current?.status === "private" &&
      dragRef.current.canPublishAtStart
    )
      cancelCurrentNoteDrag(true);
  }, [canPublish, cancelCurrentNoteDrag]);
  useEffect(() => {
    if (!hasPrivatePreview) return;
    const toolbar = privateToolbarRef.current;
    const checkPanel = () => {
      if (!isPrivatePanelExpanded(privateToolbarRef.current))
        cancelCurrentNoteDrag(true);
    };
    checkPanel();
    if (!(toolbar instanceof Element)) return;
    // パネルの開閉はtoolbar内部stateでDOM/refを保つため、親の再renderを待たず閉鎖を検知する。
    const observer = new MutationObserver(checkPanel);
    observer.observe(toolbar, {
      attributes: true,
      attributeFilter: ["data-expanded"],
    });
    return () => observer.disconnect();
  }, [hasPrivatePreview, privateToolbarRef, cancelCurrentNoteDrag]);

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
    isPointerInPrivateDropArea,
  };
}
