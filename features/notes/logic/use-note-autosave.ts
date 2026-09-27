"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import type {
  ClientMessage,
  ProtocolNote,
  ServerMessage,
} from "@/contracts/room-protocol";
import {
  loadNoteDrafts,
  type NoteDraft,
  noteDraftStorageKey,
  persistNoteDrafts,
} from "./note-draft-storage";

const AUTOSAVE_DELAY_MS = 1_000;
const ACK_STATUS_DELAY_MS = 3_000;

type ServerState = {
  ready: boolean;
  connected: boolean;
  phase: RoomPhase;
  phaseRevision: number;
  notes: Map<string, ProtocolNote>;
  pending: boolean;
};

export type RecoveryItem = { noteId: string; text: string; reason: string };

function editable(
  note: ProtocolNote | undefined,
  phase: RoomPhase,
  userId: string,
): boolean {
  if (!note || phase.kind !== "step" || note.excluded || phase.step > 2)
    return false;
  if (phase.step === 1)
    return note.visibility === "private" && note.authorId === userId;
  return note.visibility === "shared" || note.authorId === userId;
}

export function useNoteAutosave(options: {
  roomId: string;
  userId: string;
  send: (message: ClientMessage) => boolean;
}) {
  const key = noteDraftStorageKey(options.roomId, options.userId);
  const draftsRef = useRef<Map<string, NoteDraft>>(new Map());
  const serverRef = useRef<ServerState>({
    ready: false,
    connected: false,
    phase: { kind: "lobby" },
    phaseRevision: 0,
    notes: new Map(),
    pending: false,
  });
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const statusTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      for (const timer of statusTimersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      statusTimersRef.current.clear();
    },
    [],
  );
  const [revision, setRevision] = useState(0);
  const [storageFailure, setStorageFailure] = useState<string | null>(null);
  const blockedStorageRef = useRef(false);

  const repaint = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const loaded = loadNoteDrafts(key);
    draftsRef.current = new Map(
      loaded.drafts.map((draft) => [draft.noteId, draft]),
    );
    blockedStorageRef.current = loaded.failureText !== null;
    setStorageFailure(loaded.failureText);
    repaint();
  }, [key, repaint]);
  const persist = useCallback(() => {
    if (blockedStorageRef.current) return;
    if (!persistNoteDrafts(key, [...draftsRef.current.values()])) {
      setStorageFailure(
        "このタブの再読込に備えて文章を残せません。必要ならコピーしてください。",
      );
      blockedStorageRef.current = true;
    }
  }, [key]);
  const clearTimer = useCallback((noteId: string) => {
    const timer = timersRef.current.get(noteId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(noteId);
  }, []);
  const clearStatusTimer = useCallback((noteId: string) => {
    const timer = statusTimersRef.current.get(noteId);
    if (timer) clearTimeout(timer);
    statusTimersRef.current.delete(noteId);
  }, []);
  const markRecovery = useCallback(
    (draft: NoteDraft, reason: NonNullable<NoteDraft["recoveryReason"]>) => {
      clearTimer(draft.noteId);
      clearStatusTimer(draft.noteId);
      draft.recoveryReason = reason;
      draftsRef.current.set(draft.noteId, draft);
      persist();
      repaint();
    },
    [clearStatusTimer, clearTimer, persist, repaint],
  );
  const requestStatus = useCallback(
    (noteId: string, operationId: string) => {
      clearStatusTimer(noteId);
      statusTimersRef.current.set(
        noteId,
        setTimeout(() => {
          const draft = draftsRef.current.get(noteId);
          if (
            !serverRef.current.connected ||
            draft?.inFlight?.operationId !== operationId
          )
            return;
          if (!options.send({ type: "note:content-status", operationId })) {
            markRecovery(draft, "send-failed");
            return;
          }
          requestStatus(noteId, operationId);
        }, ACK_STATUS_DELAY_MS),
      );
    },
    [clearStatusTimer, markRecovery, options.send],
  );
  const sendStatus = useCallback(
    (draft: NoteDraft) => {
      if (!draft.inFlight) return;
      const operationId = draft.inFlight.operationId;
      if (!options.send({ type: "note:content-status", operationId })) {
        markRecovery(draft, "send-failed");
        return;
      }
      requestStatus(draft.noteId, operationId);
    },
    [markRecovery, options.send, requestStatus],
  );

  const flush = useCallback(
    (noteId: string) => {
      clearTimer(noteId);
      const draft = draftsRef.current.get(noteId);
      const server = serverRef.current;
      if (!draft || draft.recoveryReason || draft.composing || draft.inFlight)
        return;
      if (!server.ready || !server.connected) return;
      const note = server.notes.get(noteId);
      if (!note) {
        markRecovery(draft, "missing");
        return;
      }
      if (!editable(note, server.phase, options.userId)) {
        markRecovery(draft, "not-editable");
        return;
      }
      if (note.contentRevision !== draft.baseRevision) {
        markRecovery(draft, "conflict");
        return;
      }
      if (draft.committedText === draft.baseContent) {
        draftsRef.current.delete(noteId);
        persist();
        repaint();
        return;
      }
      const inFlight = {
        operationId: crypto.randomUUID(),
        content: draft.committedText,
        expectedContentRevision: draft.baseRevision,
        expectedPhaseRevision: server.phaseRevision,
        generation: draft.generation,
      };
      draft.inFlight = inFlight;
      persist();
      const sent = options.send({
        type: "note:update-content",
        noteId,
        content: inFlight.content,
        operationId: inFlight.operationId,
        expectedContentRevision: inFlight.expectedContentRevision,
        expectedPhaseRevision: inFlight.expectedPhaseRevision,
      });
      if (!sent) {
        draft.inFlight = null;
        markRecovery(draft, "send-failed");
      } else requestStatus(noteId, inFlight.operationId);
      repaint();
    },
    [
      clearTimer,
      markRecovery,
      options.send,
      options.userId,
      persist,
      repaint,
      requestStatus,
    ],
  );

  const schedule = useCallback(
    (noteId: string, immediate = false) => {
      clearTimer(noteId);
      if (immediate || serverRef.current.pending) {
        queueMicrotask(() => flush(noteId));
        return;
      }
      timersRef.current.set(
        noteId,
        setTimeout(() => flush(noteId), AUTOSAVE_DELAY_MS),
      );
    },
    [clearTimer, flush],
  );

  const change = useCallback(
    (noteId: string, text: string) => {
      const server = serverRef.current;
      let draft = draftsRef.current.get(noteId);
      if (!draft) {
        const note = server.notes.get(noteId);
        if (!note) return;
        draft = {
          noteId,
          baseContent: note.content,
          baseRevision: note.contentRevision,
          text: note.content,
          committedText: note.content,
          generation: 0,
          composing: false,
          inFlight: null,
          recoveryReason: null,
        };
      }
      if (draft.text === text) return;
      draft.text = text;
      draft.generation += 1;
      if (!draft.composing) draft.committedText = text;
      draftsRef.current.set(noteId, draft);
      persist();
      repaint();
      if (!draft.composing) schedule(noteId);
    },
    [persist, repaint, schedule],
  );

  const compositionStart = useCallback(
    (noteId: string) => {
      let draft = draftsRef.current.get(noteId);
      if (!draft) {
        const note = serverRef.current.notes.get(noteId);
        if (!note) return;
        draft = {
          noteId,
          baseContent: note.content,
          baseRevision: note.contentRevision,
          text: note.content,
          committedText: note.content,
          generation: 0,
          composing: false,
          inFlight: null,
          recoveryReason: null,
        };
        draftsRef.current.set(noteId, draft);
      }
      draft.composing = true;
      clearTimer(noteId);
      persist();
    },
    [clearTimer, persist],
  );
  const compositionEnd = useCallback(
    (noteId: string, text: string) => {
      change(noteId, text);
      const draft = draftsRef.current.get(noteId);
      if (!draft) return;
      draft.composing = false;
      draft.committedText = text;
      persist();
      repaint();
      schedule(noteId);
    },
    [change, persist, repaint, schedule],
  );

  const accept = useCallback(
    (operationId: string, noteId: string, contentRevision: number) => {
      const draft = draftsRef.current.get(noteId);
      if (!draft?.inFlight || draft.inFlight.operationId !== operationId)
        return;
      const sent = draft.inFlight;
      clearStatusTimer(noteId);
      draft.inFlight = null;
      draft.baseContent = sent.content;
      draft.baseRevision = contentRevision;
      const current = serverRef.current.notes.get(noteId);
      if (
        current &&
        current.contentRevision > contentRevision &&
        (draft.text !== sent.content || draft.composing)
      ) {
        markRecovery(draft, "conflict");
        return;
      }
      if (current && current.contentRevision <= contentRevision)
        serverRef.current.notes.set(noteId, {
          ...current,
          content: sent.content,
          contentRevision,
        });
      if (draft.text === sent.content && !draft.composing)
        draftsRef.current.delete(noteId);
      else if (!draft.composing) schedule(noteId, true);
      persist();
      repaint();
    },
    [clearStatusTimer, markRecovery, persist, repaint, schedule],
  );

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      const server = serverRef.current;
      if (message.type === "snapshot") {
        server.ready = true;
        server.connected = true;
        server.phase = message.phase;
        server.phaseRevision = message.phaseRevision;
        server.notes = new Map(message.notes.map((note) => [note.id, note]));
        server.pending =
          message.pendingPhaseTransition !== null &&
          message.pendingPhaseTransition !== undefined;
        for (const draft of draftsRef.current.values()) {
          if (draft.recoveryReason === "send-failed") {
            draft.recoveryReason = null;
            persist();
          }
          if (draft.recoveryReason) continue;
          if (draft.composing) {
            markRecovery(draft, "interrupted-composition");
          }
          if (draft.inFlight) {
            sendStatus(draft);
            continue;
          }
          if (draft.composing) continue;
          const note = server.notes.get(draft.noteId);
          if (!note) {
            markRecovery(draft, "missing");
            continue;
          }
          if (!editable(note, server.phase, options.userId)) {
            markRecovery(draft, "not-editable");
            continue;
          }
          if (note.contentRevision === draft.baseRevision) {
            schedule(draft.noteId, true);
          } else markRecovery(draft, "conflict");
        }
        repaint();
        return;
      }
      if (message.type === "note:inserted" || message.type === "note:updated") {
        server.notes.set(message.note.id, message.note);
        const draft = draftsRef.current.get(message.note.id);
        if (
          draft &&
          !draft.inFlight &&
          message.note.contentRevision !== draft.baseRevision
        )
          markRecovery(draft, "conflict");
        return;
      }
      if (message.type === "note:deleted") {
        server.notes.delete(message.noteId);
        const draft = draftsRef.current.get(message.noteId);
        if (draft) markRecovery(draft, "missing");
        return;
      }
      if (message.type === "note:content-saved") {
        accept(message.operationId, message.noteId, message.contentRevision);
        return;
      }
      if (message.type === "note:content-status-result") {
        const draft = [...draftsRef.current.values()].find(
          (item) => item.inFlight?.operationId === message.operationId,
        );
        if (!draft?.inFlight) return;
        if (
          message.status === "accepted" &&
          message.noteId === draft.noteId &&
          message.contentRevision !== undefined
        ) {
          accept(message.operationId, draft.noteId, message.contentRevision);
          return;
        }
        const note = server.notes.get(draft.noteId);
        if (!note || !editable(note, server.phase, options.userId)) {
          markRecovery(draft, "not-editable");
          return;
        }
        if (note.contentRevision !== draft.inFlight.expectedContentRevision) {
          markRecovery(draft, "conflict");
          return;
        }
        if (draft.inFlight.expectedPhaseRevision !== server.phaseRevision) {
          clearStatusTimer(draft.noteId);
          draft.inFlight = null;
          persist();
          schedule(draft.noteId, true);
          return;
        }
        const sent = options.send({
          type: "note:update-content",
          noteId: draft.noteId,
          content: draft.inFlight.content,
          operationId: draft.inFlight.operationId,
          expectedContentRevision: draft.inFlight.expectedContentRevision,
          expectedPhaseRevision: draft.inFlight.expectedPhaseRevision,
        });
        if (sent) requestStatus(draft.noteId, draft.inFlight.operationId);
        else markRecovery(draft, "send-failed");
        return;
      }
      if (message.type === "error" && message.operationId) {
        const draft = [...draftsRef.current.values()].find(
          (item) => item.inFlight?.operationId === message.operationId,
        );
        if (draft)
          markRecovery(
            draft,
            message.code === "content-conflict" ? "conflict" : "not-editable",
          );
        return;
      }
      if (message.type === "phase:save-requested") {
        server.pending = true;
        for (const draft of draftsRef.current.values())
          schedule(draft.noteId, true);
        return;
      }
      if (message.type === "phase:updated") {
        server.phase = message.phase;
        server.phaseRevision = message.phaseRevision;
        server.pending = false;
        for (const draft of draftsRef.current.values()) {
          if (draft.inFlight) {
            sendStatus(draft);
            continue;
          }
          if (
            !editable(
              server.notes.get(draft.noteId),
              server.phase,
              options.userId,
            )
          )
            markRecovery(draft, "not-editable");
        }
        repaint();
      }
    },
    [
      accept,
      clearStatusTimer,
      markRecovery,
      options.send,
      options.userId,
      persist,
      repaint,
      requestStatus,
      schedule,
      sendStatus,
    ],
  );

  const setConnected = useCallback((connected: boolean) => {
    if (!connected) {
      serverRef.current.connected = false;
      serverRef.current.ready = false;
      for (const timer of statusTimersRef.current.values()) clearTimeout(timer);
      statusTimersRef.current.clear();
    }
  }, []);
  const blur = useCallback(
    (noteId: string, text: string) => {
      change(noteId, text);
      flush(noteId);
    },
    [change, flush],
  );
  const recoveries: RecoveryItem[] = [...draftsRef.current.values()]
    .filter((draft) => draft.recoveryReason || storageFailure)
    .map((draft) => ({
      noteId: draft.noteId,
      text: draft.text,
      reason:
        draft.recoveryReason === "conflict"
          ? "他の編集と競合しました。"
          : draft.recoveryReason === "send-failed"
            ? "送信できませんでした。接続が戻ると安全を確認して再送します。"
            : draft.recoveryReason === "missing"
              ? "付箋が見つかりません。"
              : draft.recoveryReason === "interrupted-composition"
                ? "変換中に中断されました。"
                : draft.recoveryReason === "not-editable"
                  ? "現在は編集できません。"
                  : "このタブの再読込に備えて保存できません。",
    }));
  if (storageFailure && recoveries.length === 0)
    recoveries.push({
      noteId: "保存領域",
      text: storageFailure,
      reason: "保存領域を読み取れません。",
    });
  void revision;
  return {
    change,
    blur,
    compositionStart,
    compositionEnd,
    applyMessage,
    setConnected,
    draftValue: (noteId: string) => {
      const draft = draftsRef.current.get(noteId);
      return draft && !draft.recoveryReason ? draft.text : undefined;
    },
    recoveries,
  };
}
