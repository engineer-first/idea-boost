"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import type { Note } from "@/features/notes";
import { notify } from "@/lib/notify";

export type CandidateOperations = {
  notes: Note[];
  pendingNoteIds: string[];
  isPending: boolean;
  exclude: (noteId: string) => void;
  restore: (noteId: string) => void;
  applyMessage: (message: ServerMessage) => boolean;
};

type PendingCandidate = { id: string; noteId: string; excluded: boolean };

// 確定した付箋に候補状態だけを畳み込む。位置・票・本文は常に受信した最新値。
// 除外の結果は盤面の「除外済み」と「除外を戻す」で伝え、通知は出さない。
export function useCandidateOperations({
  notes,
  connected,
  send,
}: {
  notes: Note[];
  connected: boolean;
  send: (message: ClientMessage) => void;
}): CandidateOperations {
  const t = useTranslations("app.notifications") as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const [pending, setPending] = useState<PendingCandidate[]>([]);
  const pendingRef = useRef<PendingCandidate[]>([]);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const issuedIds = useRef(new Set<string>());

  const clear = useCallback(() => {
    pendingRef.current = [];
    setPending([]);
  }, []);

  useEffect(() => {
    if (connected) return;
    if (pendingRef.current.length) notify.error(t("connectionLost"));
    clear();
  }, [connected, clear, t]);

  const change = useCallback(
    (noteId: string, excluded: boolean) => {
      if (
        !connectedRef.current ||
        pendingRef.current.some((item) => item.noteId === noteId)
      )
        return;
      const note = notesRef.current.find((item) => item.id === noteId);
      if (!note || note.excluded === excluded) return;
      const id = crypto.randomUUID();
      issuedIds.current.add(id);
      pendingRef.current = [...pendingRef.current, { id, noteId, excluded }];
      setPending(pendingRef.current);
      send(
        excluded
          ? { type: "note:exclude", noteId, operationId: id }
          : { type: "note:restore", noteId, operationId: id },
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
      if (message.type !== "note:updated" && message.type !== "error")
        return false;
      if (message.operationId === undefined) return false;
      const operation = pendingRef.current.find(
        (item) => item.id === message.operationId,
      );
      if (!operation) return issuedIds.current.has(message.operationId);
      pendingRef.current = pendingRef.current.filter(
        (item) => item.id !== operation.id,
      );
      setPending(pendingRef.current);
      if (message.type === "error") {
        notify.error(message.message);
        return true;
      }
      const latest = notesRef.current.find(
        (note) => note.id === message.note.id,
      );
      return latest !== undefined && latest.updatedAt > message.note.updatedAt;
    },
    [clear],
  );

  return {
    notes: notes.map((note) => {
      const operation = pending.find((item) => item.noteId === note.id);
      return operation ? { ...note, excluded: operation.excluded } : note;
    }),
    pendingNoteIds: pending.map((item) => item.noteId),
    isPending: pending.length > 0,
    exclude: (noteId: string) => change(noteId, true),
    restore: (noteId: string) => change(noteId, false),
    applyMessage,
  };
}
