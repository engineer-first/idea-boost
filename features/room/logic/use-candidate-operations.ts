"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import type { Note } from "@/features/notes";
import { notify } from "@/lib/notify";
import { roomNotify } from "./room-notify";

export type CandidateOperations = {
  notes: Note[];
  pendingNoteIds: string[];
  isPending: boolean;
  exclude: (noteId: string) => void;
  restore: (noteId: string) => void;
  bulkExclude: () => void;
  bulkRestore: (operationId: string) => void;
  applyMessage: (message: ServerMessage) => boolean;
};

type PendingCandidate = { id: string; noteId: string; excluded: boolean };

// 確定した付箋に候補状態だけを畳み込む。位置・票・本文は常に受信した最新値。
export function useCandidateOperations({
  notes,
  connected,
  send,
}: {
  notes: Note[];
  connected: boolean;
  send: (message: ClientMessage) => void;
}): CandidateOperations {
  const [pending, setPending] = useState<PendingCandidate[]>([]);
  const pendingRef = useRef<PendingCandidate[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const bulkRef = useRef<string | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const issuedIds = useRef(new Set<string>());
  const notices = useRef(new Set<string | number>());

  const clear = useCallback(() => {
    pendingRef.current = [];
    setPending([]);
    bulkRef.current = null;
    setBulkPending(false);
    for (const id of notices.current) roomNotify.dismissCandidateNotice(id);
    notices.current.clear();
  }, []);

  useEffect(() => {
    if (connected) return;
    if (pendingRef.current.length || bulkRef.current)
      notify.error(
        "通信が切断されました。再接続後の候補状態を確認してください。",
      );
    clear();
  }, [connected, clear]);
  useEffect(
    () => () => {
      for (const id of notices.current) roomNotify.dismissCandidateNotice(id);
    },
    [],
  );

  const change = useCallback(
    (
      noteId: string,
      excluded: boolean,
      expectedExclusionOperationId?: string,
    ) => {
      if (
        !connectedRef.current ||
        bulkRef.current ||
        pendingRef.current.some((item) => item.noteId === noteId)
      )
        return;
      const note = notesRef.current.find((item) => item.id === noteId);
      if (!note || note.excluded === excluded) return;
      if (
        expectedExclusionOperationId !== undefined &&
        note.exclusionOperationId !== expectedExclusionOperationId
      )
        return;
      const id = crypto.randomUUID();
      issuedIds.current.add(id);
      pendingRef.current = [...pendingRef.current, { id, noteId, excluded }];
      setPending(pendingRef.current);
      send(
        excluded
          ? { type: "note:exclude", noteId, operationId: id }
          : {
              type: "note:restore",
              noteId,
              operationId: id,
              ...(expectedExclusionOperationId === undefined
                ? {}
                : { expectedExclusionOperationId }),
            },
      );
    },
    [send],
  );

  const applyMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (
        message.type === "snapshot" ||
        message.type === "phase:updated" ||
        message.type === "outcome:published" ||
        (message.type === "decision:updated" && message.decision !== null)
      ) {
        clear();
        return false;
      }
      if (
        message.type === "note:bulk-excluded" ||
        message.type === "note:bulk-restored"
      ) {
        if (bulkRef.current === message.operationId) {
          bulkRef.current = null;
          setBulkPending(false);
        } else if (issuedIds.current.has(message.operationId)) return true;
        return false;
      }
      if (message.type !== "note:updated" && message.type !== "error")
        return false;
      if (message.operationId === undefined) return false;
      const operation = pendingRef.current.find(
        (item) => item.id === message.operationId,
      );
      const isBulk = bulkRef.current === message.operationId;
      if (!operation && !isBulk)
        return issuedIds.current.has(message.operationId);
      if (operation) {
        pendingRef.current = pendingRef.current.filter(
          (item) => item.id !== operation.id,
        );
        setPending(pendingRef.current);
      }
      if (message.type === "error") {
        if (isBulk) {
          bulkRef.current = null;
          setBulkPending(false);
        }
        notify.error(message.message);
        return true;
      }
      const latest = notesRef.current.find(
        (note) => note.id === message.note.id,
      );
      const superseded =
        latest !== undefined && latest.updatedAt > message.note.updatedAt;
      if (
        operation?.excluded &&
        message.note.excluded &&
        (!superseded || latest.exclusionOperationId === operation.id)
      ) {
        const id = operation.id;
        notices.current.add(
          roomNotify.noteExcluded(() => change(operation.noteId, false, id)),
        );
      }
      return superseded;
    },
    [change, clear],
  );

  const bulkExclude = useCallback(() => {
    if (!connectedRef.current || pendingRef.current.length || bulkRef.current)
      return;
    const id = crypto.randomUUID();
    issuedIds.current.add(id);
    bulkRef.current = id;
    setBulkPending(true);
    send({ type: "note:bulk-exclude", operationId: id });
  }, [send]);

  const bulkRestore = useCallback(
    (operationId: string) => {
      if (!connectedRef.current || pendingRef.current.length || bulkRef.current)
        return;
      issuedIds.current.add(operationId);
      bulkRef.current = operationId;
      setBulkPending(true);
      send({ type: "note:bulk-restore", operationId });
    },
    [send],
  );

  return {
    notes: notes.map((note) => {
      const operation = pending.find((item) => item.noteId === note.id);
      return operation ? { ...note, excluded: operation.excluded } : note;
    }),
    pendingNoteIds: pending.map((item) => item.noteId),
    isPending: pending.length > 0 || bulkPending,
    exclude: (noteId: string) => change(noteId, true),
    restore: (noteId: string) => change(noteId, false),
    bulkExclude,
    bulkRestore,
    applyMessage,
  };
}
