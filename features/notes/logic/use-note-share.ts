"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ProtocolNote,
  ServerMessage,
  ShareReceipt,
} from "@/contracts/room-protocol";

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
    (message: ServerMessage) => {
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
        pendingRef.current.delete(message.operationId);
        setPending(pendingRef.current.size > 0);
        if (message.status === "committed") {
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
        query();
        setFeedback({
          operationId: message.operationId,
          message: message.message,
        });
      }
    },
    [query],
  );
  const owns = (noteId: string): boolean =>
    [...pendingRef.current.values()].some((item) => item.noteId === noteId);
  const renderNotes = (source: ProtocolNote[]): ProtocolNote[] =>
    source.map((note) => {
      const operation = [...pendingRef.current.values()].find(
        (item) => item.noteId === note.id,
      );
      return operation &&
        operation.visibility === "private" &&
        operation.visibility !== note.visibility
        ? {
            ...note,
            visibility: operation.visibility,
            x: operation.x ?? note.x,
            y: operation.y ?? note.y,
          }
        : note;
    });
  return {
    commit,
    applyMessage,
    pending,
    receipt,
    feedback,
    owns,
    renderNotes,
  };
}
