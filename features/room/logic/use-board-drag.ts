"use client";

// マイ付箋ツールバーとボードの付箋ドラッグの状態機械。
// - private: 本人だけのプレビュー。マイ付箋エリア内なら並べ替え、ボード上の有効な pointerup で publish する。
// - shared: 共有付箋の移動。右側のマイ付箋エリアやHUDの上を通過しても遮らず、そのまま座標移動を確定する。
// DOM 参照はビューポートとマイ付箋ツールバーの矩形読み取りだけに限定し、JSX は持たない。
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
  return (
    toolbar !== null &&
    (toolbar.dataset?.presentation === "workspace" ||
      toolbar.dataset?.expanded !== "false")
  );
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

function capturePointerSafely(
  element: HTMLDivElement | null,
  pointerId: number,
): void {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    // 合成イベントや既に終了したポインターでは例外になり得るため無視する。
  }
}

function releasePointerSafely(
  element: HTMLDivElement | null,
  pointerId: number,
): void {
  try {
    if (element?.hasPointerCapture) {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture?.(pointerId);
      }
      return;
    }
    element?.releasePointerCapture?.(pointerId);
  } catch {
    // 既に解放済みのポインターでも終了処理を止めない。
  }
}

/**
 * ドラッグ中の付箋の状態と位置情報を保持する型。
 */
export type BoardDrag = {
  note: Note;
  targetIds?: readonly string[];
  pointerId: number;
  status: "private" | "shared";
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
  // 固定2軸マップは実表示寸法と掴み位置を使い、付箋全体を枠内へ収めてから座標化する。
  notePositionFromClient?: (
    clientX: number,
    clientY: number,
    drag: BoardDrag,
  ) => CanvasPoint | null;
  // 共有済み付箋の移動を許可するか。公開（publish）の可否とは別に、
  // フェーズごとの既存付箋の移動権限を指定する。
  canMoveSharedNotes?: boolean;
  keepPrivateDragInList?: boolean;
  // false の間、マイ付箋は一覧の外へ出さない。一覧の外を指している間は
  // publishBlocked を返し、呼び出し側が付箋の近くで理由を示す。
  canPublish?: boolean;
  onNoteDragStart: (
    noteId: string,
    selectedNoteIds?: readonly string[],
  ) => void;
  onNoteDragMove: (noteId: string, x: number, y: number) => void;
  onNoteDragEnd: (noteId: string, x: number, y: number) => void;
  onNoteDragCancel: (noteId: string) => void;
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
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
  boardScrollerRef,
  worldPointFromClient,
  privateToolbarRef,
  preservePrivateGrabOffset = true,
  clampCoordinate = clampCanvasCoordinate,
  notePositionFromClient,
  canMoveSharedNotes = true,
  keepPrivateDragInList = false,
  canPublish = true,
  onNoteDragStart,
  onNoteDragMove,
  onNoteDragEnd,
  onNoteDragCancel,
  onPrivateNotePublish,
}: UseBoardDragArgs) {
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [privateOrder, setPrivateOrder] = useState<string[]>([]);
  // pointermove は React の再レンダーより速く連続発火するため、最新状態は
  // ref で参照する（state はレンダー反映用）。
  const dragRef = useRef<BoardDrag | null>(null);
  const [publishBlocked, setPublishBlockedState] = useState(false);
  const publishBlockedRef = useRef(false);
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

  // pointermove ごとに再レンダーしないよう、値が変わるときだけ state を更新する。
  const setPublishBlocked = useCallback((next: boolean) => {
    if (publishBlockedRef.current === next) return;
    publishBlockedRef.current = next;
    setPublishBlockedState(next);
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

  const renderedNotes = notes;
  let renderedPrivateNotes = applyPrivateOrder(
    orderedPrivateNotes,
    privateOrder,
  );
  if (drag?.status === "private" && drag.privateDropIndex !== null) {
    renderedPrivateNotes = placePrivateNote(
      renderedPrivateNotes,
      drag.note.id,
      drag.privateDropIndex,
    );
  }

  const isPointerInPrivateDropArea = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPrivatePanelExpanded(privateToolbarRef.current)) return false;
      const hit = document.elementFromPoint?.(clientX, clientY);
      const hud = hit?.closest("[data-board-fit-edge]");
      const toolbar = privateToolbarRef.current;
      if (
        hit?.closest("[role='dialog']") ||
        (hud && !(toolbar instanceof Element && hud.contains(toolbar)))
      )
        return false;
      const rect = toolbar?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    [privateToolbarRef],
  );

  // マイ付箋のボード公開時だけ、ダイアログやHUD上への誤ドロップを除外する。
  const boardPublishPositionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const scroller = boardScrollerRef.current;
      if (!scroller) return null;
      const hit = document.elementFromPoint?.(clientX, clientY);
      if (
        hit?.closest(
          "[data-board-fit-edge], [data-cursor-private='true'], [role='dialog']",
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

  const sharedNotePositionFromClient = useCallback(
    (clientX: number, clientY: number, current: BoardDrag) => {
      if (notePositionFromClient) {
        return notePositionFromClient(clientX, clientY, current);
      }
      const pointerPosition = worldPointFromClient(clientX, clientY);
      if (!pointerPosition) return null;
      return getPositionFromPointer({
        pointerPosition,
        drag: current,
        preservePrivateGrabOffset,
        clampCoordinate,
      });
    },
    [
      clampCoordinate,
      notePositionFromClient,
      preservePrivateGrabOffset,
      worldPointFromClient,
    ],
  );

  const privateDropIndexFromPointer = useCallback(
    (clientY: number, draggingNoteId: string, clientX?: number) => {
      const toolbar = privateToolbarRef.current;
      const noteElements = toolbar?.querySelectorAll
        ? Array.from(
            toolbar.querySelectorAll<HTMLElement>(
              "[data-testid='note-card'][data-note-id]",
            ),
          ).filter((element) => element.dataset.noteId !== draggingNoteId)
        : [];
      if (noteElements.length > 0) {
        if (
          toolbar?.dataset?.presentation === "workspace" &&
          clientX !== undefined
        ) {
          const rows: Array<{
            top: number;
            bottom: number;
            cards: Array<{ index: number; rect: DOMRect }>;
          }> = [];
          for (const [index, element] of noteElements.entries()) {
            const rect = element.getBoundingClientRect();
            let row = rows[rows.length - 1];
            if (!row || Math.abs(row.top - rect.top) > 2) {
              row = { top: rect.top, bottom: rect.bottom, cards: [] };
              rows.push(row);
            }
            row.bottom = Math.max(row.bottom, rect.bottom);
            row.cards.push({ index, rect });
          }
          const row =
            rows.find(
              (row, index) =>
                !rows[index + 1] ||
                clientY < (row.bottom + rows[index + 1].top) / 2,
            ) ?? rows[rows.length - 1];
          return (
            row.cards.find(({ rect }) => clientX < rect.left + rect.width / 2)
              ?.index ?? row.cards[row.cards.length - 1].index + 1
          );
        }
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
      current.status !== "private" ||
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
      pointer.clientX,
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
      setPublishBlocked(false);
      if (event.type !== "pointerup") {
        capturePointerSafely(boardScrollerRef.current, event.pointerId);
      }
      const pointerClientX = origin?.clientX ?? event.clientX;
      const pointerClientY = origin?.clientY ?? event.clientY;
      // 共有付箋の掴み位置はHUD重なりで欠損させず、カメラのワールド変換から直接求める。
      const pointerPosition = worldPointFromClient(
        pointerClientX,
        pointerClientY,
      );
      // 操作面は決定時に拡大されるため、座標の基準には外側の箱を使う。
      const rect =
        event.currentTarget
          ?.closest?.<HTMLElement>("[data-slot='sticky-note']")
          ?.getBoundingClientRect() ??
        event.currentTarget?.getBoundingClientRect?.();
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
        // NoteCard がドラッグ閾値を超えた時点で callback するため、
        // 見た目の掴み位置は閾値超過後ではなく最初の pointerdown 位置を使う。
        previewOffsetX: rect ? pointerClientX - rect.left : 0,
        previewOffsetY: rect ? pointerClientY - rect.top : 0,
        previewWidth: rect?.width || NOTE_WIDTH,
        previewHeight: rect?.height || NOTE_HEIGHT,
      });
      if (selected) onNoteDragStart(noteId, targetIds);
      else onNoteDragStart(noteId);
    },
    [
      worldPointFromClient,
      notes,
      selectedNoteIds,
      boardScrollerRef,
      canMoveSharedNotes,
      onNoteDragStart,
      updateDrag,
      setPublishBlocked,
    ],
  );

  const handlePrivateDragStart = useCallback(
    (
      noteId: string,
      event: ReactPointerEvent<HTMLButtonElement>,
      origin?: { clientX: number; clientY: number },
    ) => {
      if (dragRef.current || !isPrivatePanelExpanded(privateToolbarRef.current))
        return;
      // RoomDO の応答前でも、楽観表示中の付箋をそのまま掴み直せるようにする。
      const note = renderedPrivateNotes.find((n) => n.id === noteId);
      if (!note || note.excluded) return;
      setPublishBlocked(false);
      if (event.type !== "pointerup") {
        capturePointerSafely(boardScrollerRef.current, event.pointerId);
      }
      // 操作面は決定時に拡大されるため、座標の基準には外側の箱を使う。
      const rect =
        event.currentTarget
          ?.closest?.<HTMLElement>("[data-slot='sticky-note']")
          ?.getBoundingClientRect() ??
        event.currentTarget?.getBoundingClientRect?.();
      // 閾値を超えた最初のmoveはカードの外まで進むことがある。掴み位置は押下時で固定する。
      const originX = origin?.clientX ?? event.clientX;
      const originY = origin?.clientY ?? event.clientY;
      const grabOffsetX = rect?.width
        ? ((originX - rect.left) / rect.width) * NOTE_WIDTH
        : 0;
      const grabOffsetY = rect?.height
        ? ((originY - rect.top) / rect.height) *
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
        previewOffsetX: rect ? originX - rect.left : 0,
        previewOffsetY: rect ? originY - rect.top : 0,
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
      setPublishBlocked,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const currentAtPointer = {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (current.status === "shared") {
        if (!canMoveSharedNotes) return;
        const nextPosition = sharedNotePositionFromClient(
          event.clientX,
          event.clientY,
          current,
        );
        if (!nextPosition) {
          updateDrag(currentAtPointer);
          return;
        }
        onNoteDragMove(current.note.id, nextPosition.x, nextPosition.y);
        updateDrag({
          ...currentAtPointer,
          ...nextPosition,
        });
        return;
      }

      if (isPointerInPrivateDropArea(event.clientX, event.clientY)) {
        setPublishBlocked(false);
        updateDrag({
          ...currentAtPointer,
          privateDropIndex: privateDropIndexFromPointer(
            event.clientY,
            current.note.id,
            event.clientX,
          ),
        });
        trackPrivateListAutoScroll(
          event.pointerId,
          event.clientX,
          event.clientY,
        );
        return;
      }

      stopPrivateListAutoScroll();
      if (keepPrivateDragInList) return;
      if (!canPublish) {
        // 共有できない付箋はボードへ運ばせず、一覧の端で止めて理由を示す。
        setPublishBlocked(true);
        return;
      }
      // ドラッグ中に自分の番になったら、そのままボードへ運べる。
      setPublishBlocked(false);
      const mappedPosition = notePositionFromClient?.(
        event.clientX,
        event.clientY,
        current,
      );
      const position = notePositionFromClient
        ? mappedPosition
        : boardPublishPositionFromPointer(event.clientX, event.clientY);
      if (!position) {
        updateDrag({ ...currentAtPointer, privateDropIndex: null });
        return;
      }
      const nextPosition =
        mappedPosition ??
        getPositionFromPointer({
          pointerPosition: position,
          drag: current,
          preservePrivateGrabOffset,
          clampCoordinate,
        });
      updateDrag({
        ...currentAtPointer,
        ...nextPosition,
        privateDropIndex: null,
      });
    },
    [
      boardPublishPositionFromPointer,
      canPublish,
      keepPrivateDragInList,
      canMoveSharedNotes,
      clampCoordinate,
      isPointerInPrivateDropArea,
      privateDropIndexFromPointer,
      sharedNotePositionFromClient,
      stopPrivateListAutoScroll,
      trackPrivateListAutoScroll,
      onNoteDragMove,
      setPublishBlocked,
      notePositionFromClient,
      preservePrivateGrabOffset,
      updateDrag,
    ],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      let current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;

      if (current.status === "shared") {
        stopPrivateListAutoScroll();
        setPublishBlocked(false);
        if (!canMoveSharedNotes) {
          onNoteDragCancel(current.note.id);
        } else {
          const position = sharedNotePositionFromClient(
            event.clientX,
            event.clientY,
            current,
          );
          onNoteDragEnd(
            current.note.id,
            position?.x ?? current.x,
            position?.y ?? current.y,
          );
        }
        updateDrag(null);
        releasePointerSafely(boardScrollerRef.current, event.pointerId);
        return;
      }

      if (!isPrivatePanelExpanded(privateToolbarRef.current)) {
        stopPrivateListAutoScroll();
        updateDrag(null);
        releasePointerSafely(boardScrollerRef.current, event.pointerId);
        return;
      }
      // 最終moveが届かなくても、解放位置で共有境界と挿入先を更新してから確定する。
      handlePointerMove(event);
      current = dragRef.current;
      if (!current) return;
      stopPrivateListAutoScroll();
      setPublishBlocked(false);
      if (!isPointerInPrivateDropArea(event.clientX, event.clientY)) {
        const point = boardPublishPositionFromPointer(
          event.clientX,
          event.clientY,
        );
        const position = point
          ? notePositionFromClient
            ? notePositionFromClient(event.clientX, event.clientY, current)
            : getPositionFromPointer({
                pointerPosition: point,
                drag: current,
                preservePrivateGrabOffset,
                clampCoordinate,
              })
          : null;
        if (canPublish && position && privateToolbarRef.current) {
          onPrivateNotePublish(current.note.id, position.x, position.y);
        }
        updateDrag(null);
        releasePointerSafely(boardScrollerRef.current, event.pointerId);
        return;
      }
      if (current.privateDropIndex !== null) {
        const privateDropIndex = current.privateDropIndex;
        setPrivateOrder((order) =>
          placePrivateNote(
            applyPrivateOrder(orderedPrivateNotes, order),
            current.note.id,
            privateDropIndex,
          ).map((note) => note.id),
        );
      }
      updateDrag(null);
      releasePointerSafely(boardScrollerRef.current, event.pointerId);
    },
    [
      handlePointerMove,
      boardPublishPositionFromPointer,
      boardScrollerRef,
      canMoveSharedNotes,
      clampCoordinate,
      isPointerInPrivateDropArea,
      onNoteDragEnd,
      onPrivateNotePublish,
      privateToolbarRef,
      orderedPrivateNotes,
      onNoteDragCancel,
      canPublish,
      notePositionFromClient,
      preservePrivateGrabOffset,
      sharedNotePositionFromClient,
      stopPrivateListAutoScroll,
      updateDrag,
      setPublishBlocked,
    ],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      stopPrivateListAutoScroll();
      setPublishBlocked(false);
      if (current.status !== "private") onNoteDragCancel(current.note.id);
      updateDrag(null);
      releasePointerSafely(boardScrollerRef.current, event.pointerId);
    },
    [
      boardScrollerRef,
      onNoteDragCancel,
      stopPrivateListAutoScroll,
      updateDrag,
      setPublishBlocked,
    ],
  );

  const cancelCurrentNoteDrag = useCallback(
    (includePrivate = false) => {
      const current = dragRef.current;
      stopPrivateListAutoScroll();
      if (!current || (!includePrivate && current.status === "private")) return;
      setPublishBlocked(false);
      if (current.status !== "private") onNoteDragCancel(current.note.id);
      updateDrag(null);
      releasePointerSafely(boardScrollerRef.current, current.pointerId);
    },
    [
      boardScrollerRef,
      onNoteDragCancel,
      stopPrivateListAutoScroll,
      updateDrag,
      setPublishBlocked,
    ],
  );

  const hasPrivatePreview = drag?.status === "private";
  useEffect(() => {
    const current = dragRef.current;
    if (
      !canPublish &&
      current?.status === "private" &&
      current.canPublishAtStart
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

  const hasActiveDragPointer = useCallback((pointerId: number) => {
    return dragRef.current?.pointerId === pointerId;
  }, []);

  return {
    drag,
    publishBlocked,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel,
    cancelCurrentNoteDrag,
    isCurrentDragPointer,
    hasActiveDragPointer,
  };
}
