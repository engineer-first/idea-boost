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
  ServerMessage,
} from "@/contracts/room-protocol";
import { createThrottled } from "@/lib/throttle";
import {
  applyServerMessage,
  moveNoteLocally,
  type Note,
  resetNoteVoteLocally,
  voteNoteLocally,
} from "./notes-reducer";
import {
  applyRemoteNoteDragMessage,
  type RemoteNoteDrag,
  removeExpiredRemoteNoteDrags,
} from "./remote-note-drag";

type NoteDragPayload = { id: string; x: number; y: number };

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
  voteNote: (noteId: string, kind: DotVoteKind) => void;
  resetNoteVote: (noteId: string, kind: DotVoteKind) => void;
};

export function useRoomNotes({
  send,
}: {
  send: (message: ClientMessage) => void;
}): UseRoomNotesResult {
  // 付箋の初期状態は空。確定状態の真実はサーバー（RoomDO）側にあり、
  // 接続直後に送られてくる snapshot で復元される。
  const [notes, setNotes] = useState<Note[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [remoteNoteDrags, setRemoteNoteDrags] = useState<RemoteNoteDrag[]>([]);
  const notesRef = useRef<Note[]>(notes);
  const draggingNoteIdRef = useRef<string | null>(null);
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

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      const receivedAt = Date.now();
      updateNotes((current) =>
        applyServerMessage(current, message, {
          draggingNoteId: draggingNoteIdRef.current,
        }),
      );
      setRemoteNoteDrags((current) =>
        applyRemoteNoteDragMessage(current, message, receivedAt),
      );
    },
    [updateNotes],
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
    (noteId: string, kind: DotVoteKind) => {
      const result = voteNoteLocally(notesRef.current, noteId, kind);
      if (!result.accepted) return;
      notesRef.current = result.notes;
      setNotes(result.notes);
      send({ type: "note:vote", noteId, kind });
    },
    [send],
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
    resetNoteVote,
  };
}
