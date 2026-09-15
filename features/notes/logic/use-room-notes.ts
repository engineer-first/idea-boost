"use client";

// 付箋の状態とプロトコル化・楽観更新ポリシーの hook（ボード画面専用）。
//
// 楽観更新のポリシー:
// - 移動・本文: 楽観更新する（自分の操作の追従性を優先）
// - 削除: 楽観更新しない。author 以外の削除はサーバーが forbidden で拒否するため、
//   確定（note:deleted）を待ってから消すことで「消えたのに戻る」揺れを避ける
// - 投票: 上限判定つきでローカル反映し、受理された操作だけ送信する
//
// 「自分がドラッグ中の付箋」については、他クライアント（＝自分自身のエコーを含む）
// からの位置更新を無視し、ローカルの操作を優先する（notes-reducer.ts）。
import { useCallback, useEffect, useRef, useState } from "react";
import { DRAG_BROADCAST_THROTTLE_MS } from "@/contracts/board";
import type {
  ClientMessage,
  DotVoteKind,
  DotVoteSticker,
  ServerMessage,
} from "@/contracts/room-protocol";
import { createThrottled } from "@/lib/throttle";
import {
  addVoteStickerLocally,
  applyServerMessage,
  moveNoteLocally,
  moveVoteStickerLocally,
  type Note,
  removeOneNoteVoteLocally,
  removeVoteStickerLocally,
  resetNoteVoteLocally,
  restoreVoteStickerLocally,
  voteNoteLocally,
} from "./notes-reducer";
import {
  applyRemoteNoteDragMessage,
  type RemoteNoteDrag,
  removeExpiredRemoteNoteDrags,
} from "./remote-note-drag";

type NoteDragPayload = { id: string; x: number; y: number };

export type PendingVoteOperation = {
  id: string;
  noteId: string;
  stickerId?: string;
  kind: DotVoteKind;
  action: "add" | "remove" | "move";
  // remove の拒否時に同じシールを戻すためのスナップショット。
  sticker?: DotVoteSticker;
  // move の拒否時に移動前の付箋・座標へ戻すためのスナップショット。
  previous?: {
    noteId: string;
    x: number;
    y: number;
  };
};

export type VoteFeedback = {
  state: "confirmed" | "failed";
  message: string;
};

export type UseRoomNotesResult = {
  notes: Note[];
  draggingNoteId: string | null;
  remoteNoteDrags: RemoteNoteDrag[];
  // サーバーメッセージを notes state に畳み込む。ドラッグ中の付箋への
  // エコーはローカル優先で無視される。
  applyMessage: (message: ServerMessage) => void;
  // 新規付箋は個人ツールバーへだけ挿入される。ID生成と永続化はRoomDOに一本化する。
  // content はテンプレート・具体例を起点にしたプリフィル付き作成用。
  addNote: (content?: string) => void;
  publishNote: (noteId: string, x: number, y: number) => void;
  unpublishNote: (noteId: string) => void;
  startNoteDrag: (noteId: string) => void;
  // ドラッグ中: 即時ローカル反映 + note:drag をスロットル送信。
  moveNote: (noteId: string, x: number, y: number) => void;
  // ドロップ確定: note:move を送信（ドラッグ中の座標はサーバーに残らない）。
  endNoteDrag: (noteId: string, x: number, y: number) => void;
  // 入力中の見た目を止めないため本文だけは楽観更新する。
  changeNoteContent: (noteId: string, content: string) => void;
  deleteNote: (noteId: string) => void;
  voteNote: (noteId: string, kind: DotVoteKind, x?: number, y?: number) => void;
  removeNoteVote: (noteId: string, kind: DotVoteKind) => void;
  removeVoteSticker: (stickerId: string) => void;
  moveVoteSticker: (
    stickerId: string,
    noteId: string,
    x: number,
    y: number,
  ) => void;
  resetNoteVote: (noteId: string, kind: DotVoteKind) => void;
  pendingVoteOperations: PendingVoteOperation[];
  voteFeedback: VoteFeedback | null;
};

export function useRoomNotes({
  send,
  createVoteOperationId = () => crypto.randomUUID(),
  createVoteStickerId = () => crypto.randomUUID(),
}: {
  send: (message: ClientMessage) => void;
  createVoteOperationId?: () => string;
  createVoteStickerId?: () => string;
}): UseRoomNotesResult {
  // 付箋の初期状態は空。確定状態の真実はサーバー（RoomDO）側にあり、
  // 接続直後に送られてくる snapshot で復元される。
  const [notes, setNotes] = useState<Note[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [remoteNoteDrags, setRemoteNoteDrags] = useState<RemoteNoteDrag[]>([]);
  const [pendingVoteOperations, setPendingVoteOperations] = useState<
    PendingVoteOperation[]
  >([]);
  const [voteFeedback, setVoteFeedback] = useState<VoteFeedback | null>(null);
  const notesRef = useRef<Note[]>(notes);
  const draggingNoteIdRef = useRef<string | null>(null);
  const pendingVoteOperationsRef = useRef<PendingVoteOperation[]>([]);
  const sendDragRef = useRef<ReturnType<
    typeof createThrottled<[NoteDragPayload]>
  > | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    draggingNoteIdRef.current = draggingNoteId;
  }, [draggingNoteId]);

  useEffect(() => {
    sendDragRef.current = createThrottled((payload: NoteDragPayload) => {
      send({
        type: "note:drag",
        noteId: payload.id,
        x: payload.x,
        y: payload.y,
      });
    }, DRAG_BROADCAST_THROTTLE_MS);
    return () => {
      sendDragRef.current?.cancel();
      sendDragRef.current = null;
      notesRef.current = [];
    };
  }, [send]);

  // 連続メッセージ・連続操作でも最新の notes を引けるよう、ref と state を
  // 同期して更新する。
  const updateNotes = useCallback((update: (current: Note[]) => Note[]) => {
    const next = update(notesRef.current);
    notesRef.current = next;
    setNotes(next);
    return next;
  }, []);

  const updatePendingVoteOperations = useCallback(
    (update: (current: PendingVoteOperation[]) => PendingVoteOperation[]) => {
      const next = update(pendingVoteOperationsRef.current);
      pendingVoteOperationsRef.current = next;
      setPendingVoteOperations(next);
      return next;
    },
    [],
  );

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      const receivedAt = Date.now();
      if (message.type === "error" && message.operationId !== undefined) {
        const operation = pendingVoteOperationsRef.current.find(
          ({ id }) => id === message.operationId,
        );
        if (operation) {
          updateNotes((current) => {
            const result = (() => {
              if (
                operation.action === "add" &&
                operation.stickerId !== undefined
              ) {
                return removeVoteStickerLocally(current, operation.stickerId);
              }
              if (operation.action === "add") {
                return removeOneNoteVoteLocally(
                  current,
                  operation.noteId,
                  operation.kind,
                );
              }
              if (operation.action === "remove" && operation.sticker) {
                return restoreVoteStickerLocally(
                  current,
                  operation.noteId,
                  operation.sticker,
                );
              }
              if (
                operation.action === "move" &&
                operation.stickerId !== undefined &&
                operation.previous !== undefined
              ) {
                return moveVoteStickerLocally(
                  current,
                  operation.stickerId,
                  operation.previous.noteId,
                  operation.previous.x,
                  operation.previous.y,
                );
              }
              return voteNoteLocally(current, operation.noteId, operation.kind);
            })();
            return result.notes;
          });
          updatePendingVoteOperations((current) =>
            current.filter(({ id }) => id !== operation.id),
          );
          setVoteFeedback({ state: "failed", message: message.message });
        }
        return;
      }

      if (
        message.type === "snapshot" &&
        pendingVoteOperationsRef.current.length > 0
      ) {
        updatePendingVoteOperations(() => []);
        setVoteFeedback({
          state: "failed",
          message: "通信が切断されたため、投票状態を再同期しました。",
        });
      }

      updateNotes((current) => {
        const next = applyServerMessage(current, message, {
          draggingNoteId: draggingNoteIdRef.current,
        });
        if (message.type !== "note:updated") return next;

        // 操作IDなしの途中応答（別のシール追加など）が先に届いても、まだ
        // 確定していない自分のシールを消さない。確定応答には同じ stickerId が
        // 含まれるので重複させず、拒否応答は上の分岐で即座に取り除く。
        const previous = current.find(({ id }) => id === message.note.id);
        if (!previous) return next;
        const pendingStickers = pendingVoteOperationsRef.current
          .filter(
            ({ action, noteId, stickerId }) =>
              action === "add" &&
              noteId === message.note.id &&
              stickerId !== undefined,
          )
          .flatMap(({ stickerId }) =>
            previous.dotVoteStickers.filter(({ id }) => id === stickerId),
          );
        if (pendingStickers.length === 0) return next;
        return next.map((note) =>
          note.id !== message.note.id
            ? note
            : {
                ...note,
                dotVoteStickers: [
                  ...note.dotVoteStickers,
                  ...pendingStickers.filter(
                    (sticker) =>
                      !note.dotVoteStickers.some(({ id }) => id === sticker.id),
                  ),
                ],
              },
        );
      });

      if (
        message.type === "note:updated" &&
        message.operationId !== undefined
      ) {
        const operation = pendingVoteOperationsRef.current.find(
          ({ id }) => id === message.operationId,
        );
        if (operation) {
          updatePendingVoteOperations((current) =>
            current.filter(({ id }) => id !== operation.id),
          );
          setVoteFeedback({
            state: "confirmed",
            message: "投票を確定しました。",
          });
        }
      }
      setRemoteNoteDrags((current) =>
        applyRemoteNoteDragMessage(current, message, receivedAt),
      );
    },
    [updateNotes, updatePendingVoteOperations],
  );

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setRemoteNoteDrags((current) => {
        const next = removeExpiredRemoteNoteDrags(current);
        return next.length === current.length ? current : next;
      });
    }, 500);
    return () => globalThis.clearInterval(timer);
  }, []);

  const addNote = useCallback(
    (content?: string) => {
      send(
        content === undefined
          ? { type: "note:create" }
          : { type: "note:create", content },
      );
    },
    [send],
  );

  const publishNote = useCallback(
    (noteId: string, x: number, y: number) => {
      send({ type: "note:publish", noteId, x, y });
    },
    [send],
  );

  const unpublishNote = useCallback(
    (noteId: string) => {
      setDraggingNoteId(null);
      send({ type: "note:unpublish", noteId });
    },
    [send],
  );

  const startNoteDrag = useCallback((noteId: string) => {
    draggingNoteIdRef.current = noteId;
    setDraggingNoteId(noteId);
  }, []);

  const moveNote = useCallback(
    (noteId: string, x: number, y: number) => {
      // 自分自身の操作なので即座にローカル反映する。
      updateNotes((current) => moveNoteLocally(current, noteId, x, y));
      sendDragRef.current?.({ id: noteId, x, y });
    },
    [updateNotes],
  );

  const endNoteDrag = useCallback(
    (noteId: string, x: number, y: number) => {
      sendDragRef.current?.cancel();
      draggingNoteIdRef.current = null;
      setDraggingNoteId(null);
      updateNotes((current) => moveNoteLocally(current, noteId, x, y));
      send({ type: "note:move", noteId, x, y });
    },
    [updateNotes, send],
  );

  const changeNoteContent = useCallback(
    (noteId: string, content: string) => {
      updateNotes((current) =>
        current.map((note) =>
          note.id === noteId ? { ...note, content } : note,
        ),
      );
      send({ type: "note:update-content", noteId, content });
    },
    [updateNotes, send],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      send({ type: "note:delete", noteId });
    },
    [send],
  );

  const voteNote = useCallback(
    (noteId: string, kind: DotVoteKind, x = 0.5, y = 0.5) => {
      const sticker: DotVoteSticker = {
        id: createVoteStickerId(),
        kind,
        x,
        y,
      };
      const result = addVoteStickerLocally(notesRef.current, noteId, sticker);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        stickerId: sticker.id,
        kind,
        action: "add",
      };
      updatePendingVoteOperations((current) => [...current, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:add",
        noteId,
        stickerId: sticker.id,
        kind,
        x,
        y,
        operationId: operation.id,
      });
    },
    [
      createVoteOperationId,
      createVoteStickerId,
      send,
      updatePendingVoteOperations,
    ],
  );

  const removeNoteVote = useCallback(
    (noteId: string, kind: DotVoteKind) => {
      const result = removeOneNoteVoteLocally(notesRef.current, noteId, kind);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        kind,
        action: "remove",
      };
      updatePendingVoteOperations((current) => [...current, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-remove",
        noteId,
        kind,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const removeVoteSticker = useCallback(
    (stickerId: string) => {
      if (
        pendingVoteOperationsRef.current.some(
          (operation) => operation.stickerId === stickerId,
        )
      ) {
        return;
      }
      const current = notesRef.current;
      const note = current.find((candidate) =>
        candidate.dotVoteStickers.some((sticker) => sticker.id === stickerId),
      );
      const sticker = note?.dotVoteStickers.find(
        (candidate) => candidate.id === stickerId,
      );
      if (!note || !sticker) return;

      const result = removeVoteStickerLocally(current, stickerId);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId: note.id,
        stickerId,
        kind: sticker.kind,
        action: "remove",
        sticker,
      };
      updatePendingVoteOperations((pending) => [...pending, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:remove",
        stickerId,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const moveVoteSticker = useCallback(
    (stickerId: string, noteId: string, x: number, y: number) => {
      if (
        pendingVoteOperationsRef.current.some(
          (operation) => operation.stickerId === stickerId,
        )
      ) {
        return;
      }
      const current = notesRef.current;
      const source = current.find((note) =>
        note.dotVoteStickers.some((sticker) => sticker.id === stickerId),
      );
      const sticker = source?.dotVoteStickers.find(
        (candidate) => candidate.id === stickerId,
      );
      if (!source || !sticker) return;

      const result = moveVoteStickerLocally(current, stickerId, noteId, x, y);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      const operation: PendingVoteOperation = {
        id: createVoteOperationId(),
        noteId,
        stickerId,
        kind: sticker.kind,
        action: "move",
        previous: { noteId: source.id, x: sticker.x, y: sticker.y },
      };
      updatePendingVoteOperations((pending) => [...pending, operation]);
      setVoteFeedback(null);
      send({
        type: "note:vote-sticker:move",
        stickerId,
        noteId,
        x,
        y,
        operationId: operation.id,
      });
    },
    [createVoteOperationId, send, updatePendingVoteOperations],
  );

  const resetNoteVote = useCallback(
    (noteId: string, kind: DotVoteKind) => {
      const result = resetNoteVoteLocally(notesRef.current, noteId, kind);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      send({ type: "note:vote-reset", noteId, kind });
    },
    [send],
  );

  return {
    notes,
    draggingNoteId,
    remoteNoteDrags,
    applyMessage,
    addNote,
    publishNote,
    unpublishNote,
    startNoteDrag,
    moveNote,
    endNoteDrag,
    changeNoteContent,
    deleteNote,
    voteNote,
    removeNoteVote,
    removeVoteSticker,
    moveVoteSticker,
    resetNoteVote,
    pendingVoteOperations,
    voteFeedback,
  };
}
