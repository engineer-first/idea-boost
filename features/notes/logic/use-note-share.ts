"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ProtocolNote,
  ServerMessage,
  ShareReceipt,
} from "@/contracts/room-protocol";

/** 応答が返って終わった共有。shared は共有が確定した位置と版、できなかったときは null。 */
export type ShareResolution = {
  noteId: string;
  shared: ShareReceipt["after"] | null;
};

export function useNoteShare({
  send,
  notes,
  createId,
}: {
  send: (message: ClientMessage) => void;
  notes: ProtocolNote[];
  createId: () => string;
}) {
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const capability = useRef({ enabled: false, phaseRevision: 0 });
  const pendingRef = useRef(
    new Map<
      string,
      {
        noteId: string;
        visibility: "private" | "shared";
        x?: number;
        y?: number;
      }
    >(),
  );
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<ShareReceipt | null>(null);
  const [feedback, setFeedback] = useState<{
    operationId: string;
    message: string;
  } | null>(null);
  const query = useCallback(() => {
    for (const operationId of pendingRef.current.keys())
      send({ type: "note:share:status", operationId });
  }, [send]);
  useEffect(() => {
    const timer = setInterval(query, 2_000);
    return () => clearInterval(timer);
  }, [query]);
  const commit = useCallback(
    (
      message: Extract<
        ClientMessage,
        { type: "note:publish" | "note:unpublish" }
      >,
    ) => {
      if (
        [...pendingRef.current.values()].some(
          (item) => item.noteId === message.noteId,
        )
      ) {
        query();
        return;
      }
      if (!capability.current.enabled) {
        send(message);
        return;
      }
      const note = notesRef.current.find((note) => note.id === message.noteId);
      if (!note) return;
      const operationId = createId();
      pendingRef.current.set(operationId, {
        noteId: message.noteId,
        visibility: message.type === "note:publish" ? "shared" : "private",
        ...(message.type === "note:publish"
          ? { x: message.x, y: message.y }
          : {}),
      });
      setPending(true);
      setFeedback(null);
      setReceipt(null);
      send({
        ...message,
        operationId,
        expectedPhaseRevision: capability.current.phaseRevision,
        expectedPositionRevision: note.positionRevision ?? 0,
        expectedVisibilityRevision: note.visibilityRevision ?? 0,
      });
    },
    [send, createId, query],
  );
  const applyMessage = useCallback(
    (message: ServerMessage): ShareResolution | null => {
      let resolved: ShareResolution | null = null;
      if (message.type === "snapshot") {
        capability.current = {
          enabled: message.shareProtocolVersion === 1,
          phaseRevision: message.phaseRevision,
        };
        query();
      } else if (message.type === "phase:updated") {
        capability.current.phaseRevision = message.phaseRevision;
        query();
      } else if (
        message.type === "note:share:result" &&
        pendingRef.current.has(message.operationId)
      ) {
        const operation = pendingRef.current.get(message.operationId);
        const after =
          message.status === "committed" ? message.receipt?.after : undefined;
        resolved = operation
          ? {
              noteId: operation.noteId,
              shared: after?.visibility === "shared" ? after : null,
            }
          : null;
        pendingRef.current.delete(message.operationId);
        setPending(pendingRef.current.size > 0);
        if (message.status === "committed") {
          setFeedback((current) =>
            current?.operationId === message.operationId ? null : current,
          );
          setReceipt(message.receipt ?? null);
        } else
          setFeedback({
            operationId: message.operationId,
            message:
              message.reason ??
              "共有の結果を確認できませんでした。現在の付箋を確認してください。",
          });
      } else if (
        message.type === "error" &&
        message.operationId &&
        pendingRef.current.has(message.operationId)
      ) {
        // errorへの即時再照会はerror→statusの応答ループになり得る。
        // 再送せず、2秒timerまたは再接続snapshotで結果を確認する。
        setFeedback({
          operationId: message.operationId,
          message: message.message,
        });
      }
      return resolved;
    },
    [query],
  );
  const owns = (noteId: string): boolean =>
    [...pendingRef.current.values()].some((item) => item.noteId === noteId);
  // 応答待ちの共有・戻しは本人の画面だけ行き先へ置く。ドロップした付箋が
  // 応答までマイ付箋へ戻って見えないようにし、拒否・結果不明では最新の値へ戻す。
  // 他の参加者へは RoomDO の確定後にだけ配信される。
  // 置いた直後に動かした付箋（movedNoteIds）は、移動の表示が決めた位置を保つ。
  const renderNotes = (
    source: ProtocolNote[],
    movedNoteIds?: ReadonlySet<string>,
  ): ProtocolNote[] =>
    source.map((note) => {
      const operation = [...pendingRef.current.values()].find(
        (item) => item.noteId === note.id,
      );
      if (!operation || operation.visibility === note.visibility) return note;
      const moved = movedNoteIds?.has(note.id) === true;
      return {
        ...note,
        visibility: operation.visibility,
        x: moved ? note.x : (operation.x ?? note.x),
        y: moved ? note.y : (operation.y ?? note.y),
      };
    });
  // 共有の応答待ちの付箋が、本人の画面でボードに出ている姿。待ちが無ければ null。
  const pendingSharedNote = useCallback((noteId: string) => {
    const operation = [...pendingRef.current.values()].find(
      (item) => item.noteId === noteId,
    );
    const note = notesRef.current.find((note) => note.id === noteId);
    return operation?.visibility === "shared" && note
      ? {
          ...note,
          visibility: "shared" as const,
          x: operation.x ?? note.x,
          y: operation.y ?? note.y,
        }
      : null;
  }, []);
  return {
    commit,
    pendingSharedNote,
    applyMessage,
    pending,
    receipt,
    feedback,
    owns,
    renderNotes,
  };
}
