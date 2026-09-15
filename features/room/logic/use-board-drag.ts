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
  useRef,
  useState,
} from "react";
import { NOTE_HEIGHT, NOTE_WIDTH } from "@/contracts/board";
import type { Note } from "@/features/notes";
import { type CanvasPoint, clampCanvasCoordinate } from "./canvas-camera";

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
};

/**
 * useBoardDrag フックに引き渡す引数オプションの型。
 */
export type UseBoardDragArgs = {
  notes: Note[];
  privateNotes: Note[];
  currentUserId: string;
  boardRootRef: RefObject<HTMLDivElement | null>;
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
  onPrivateNotePublish: (noteId: string, x: number, y: number) => void;
  onPrivateNoteUnpublish: (noteId: string) => void;
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
  boardRootRef,
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

  const updateDrag = useCallback((next: BoardDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  // 非公開へ戻す操作は RoomDO の応答で確定する。ただしドラッグ中は応答を
  // 待たずに、カードをポインターのある領域へ表示し直す。
  const renderedNotes =
    drag?.status === "returning"
      ? notes.filter((note) => note.id !== drag.note.id)
      : notes;
  const privateNotesWithPending = [
    ...privateNotes,
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
    (clientX: number, draggingNoteId: string) => {
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
          return clientX < rect.left + rect.width / 2;
        });
        return index === -1 ? noteElements.length : index;
      }

      const rect = toolbar?.getBoundingClientRect();
      if (!rect) return 0;
      const width = Math.max(rect.right - rect.left, 1);
      return Math.min(
        privateNotes.length,
        Math.max(
          0,
          Math.round(((clientX - rect.left) / width) * privateNotes.length),
        ),
      );
    },
    [privateNotes.length, privateToolbarRef],
  );

  const handleSharedNoteDragStart = useCallback(
    (noteId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canMoveSharedNotes) return;
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      hasNotifiedBlockedRef.current = false;
      boardRootRef.current?.setPointerCapture?.(event.pointerId);
      const pointerPosition = boardPositionFromPointer(
        event.clientX,
        event.clientY,
      );
      updateDrag({
        note,
        pointerId: event.pointerId,
        status: "shared",
        privateDropIndex: null,
        x: note.x,
        y: note.y,
        grabOffsetX: pointerPosition ? pointerPosition.x - note.x : 0,
        grabOffsetY: pointerPosition ? pointerPosition.y - note.y : 0,
      });
      onNoteDragStart(noteId);
    },
    [
      boardPositionFromPointer,
      notes,
      boardRootRef,
      canMoveSharedNotes,
      onNoteDragStart,
      updateDrag,
    ],
  );

  const handlePrivateDragStart = useCallback(
    (noteId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      const note = privateNotes.find((n) => n.id === noteId);
      if (!note) return;
      hasNotifiedBlockedRef.current = false;
      boardRootRef.current?.setPointerCapture?.(event.pointerId);
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
        privateDropIndex: privateNotes.findIndex(
          (candidate) => candidate.id === noteId,
        ),
        x: note.x,
        y: note.y,
        grabOffsetX,
        grabOffsetY,
      });
    },
    [privateNotes, boardRootRef, updateDrag],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.status === "shared" && !canMoveSharedNotes) return;

      if (isPointerOverPrivateToolbar(event.clientX, event.clientY)) {
        if (
          current.status === "shared" &&
          current.note.authorId === currentUserId
        ) {
          onPrivateNoteUnpublish(current.note.id);
          updateDrag({
            ...current,
            status: "returning",
            privateDropIndex: privateDropIndexFromPointer(
              event.clientX,
              current.note.id,
            ),
          });
        } else if (current.status === "private") {
          updateDrag({
            ...current,
            privateDropIndex: privateDropIndexFromPointer(
              event.clientX,
              current.note.id,
            ),
          });
        }
        return;
      }

      const position = boardPositionFromPointer(event.clientX, event.clientY);
      if (!position) return;
      const nextPosition = getPositionFromPointer({
        pointerPosition: position,
        drag: current,
        preservePrivateGrabOffset,
        clampCoordinate,
      });
      if (current.status === "private" || current.status === "returning") {
        if (!canPublish) {
          if (!hasNotifiedBlockedRef.current) {
            onPublishBlocked?.();
            hasNotifiedBlockedRef.current = true;
          }
          updateDrag({ ...current, status: "shared", ...nextPosition });
          return;
        }
        // ボードに入った瞬間に共有化する。以後の座標は既存のdrag配信を使う。
        onPrivateNotePublish(current.note.id, nextPosition.x, nextPosition.y);
        onNoteDragStart(current.note.id);
      } else if (!canPublish) {
        updateDrag({ ...current, status: "shared", ...nextPosition });
        return;
      }
      // publish と同じ WebSocket 接続で送るため、publish のあとに届く drag は
      // RoomDO 側でも公開後の付箋として処理される。
      onNoteDragMove(current.note.id, nextPosition.x, nextPosition.y);
      updateDrag({
        ...current,
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
      onNoteDragMove,
      onNoteDragStart,
      onPrivateNotePublish,
      onPrivateNoteUnpublish,
      onPublishBlocked,
      preservePrivateGrabOffset,
      updateDrag,
    ],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
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
                    ...privateNotes,
                    { ...current.note, visibility: "private" as const },
                  ]
                : privateNotes,
              order,
            ),
            current.note.id,
            privateDropIndex,
          ).map((note) => note.id),
        );
        if (current.status === "returning") {
          setPendingReturnedNotes((pending) => ({
            ...pending,
            [current.note.id]: {
              ...current.note,
              visibility: "private" as const,
            },
          }));
        }
      }
      boardRootRef.current?.releasePointerCapture?.(event.pointerId);
      updateDrag(null);
    },
    [
      boardPositionFromPointer,
      boardRootRef,
      canMoveSharedNotes,
      clampCoordinate,
      onNoteDragEnd,
      privateNotes,
      preservePrivateGrabOffset,
      updateDrag,
    ],
  );

  return {
    drag,
    renderedNotes,
    renderedPrivateNotes,
    handleSharedNoteDragStart,
    handlePrivateDragStart,
    handlePointerMove,
    handlePointerEnd,
  };
}
