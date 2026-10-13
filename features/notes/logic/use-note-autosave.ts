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

// 保存開始後に版が変わっても継続できるのは、本人の個人→同段階共有だけ。
function canContinueDraft(
  draft: NoteDraft,
  server: ServerState,
  userId: string,
): boolean {
  const note = server.notes.get(draft.noteId);
  if (!editable(note, server.phase, userId)) return false;
  const revision = draft.phaseRevision ?? draft.inFlight?.expectedPhaseRevision;
  if (revision === server.phaseRevision) return true;
  return (
    draft.phase?.kind === "step" &&
    draft.phase.step === 1 &&
    server.phase.kind === "step" &&
    server.phase.step === 2 &&
    draft.phase.phase === server.phase.phase &&
    note?.visibility === "private" &&
    note.authorId === userId
  );
}

export function useNoteAutosave(options: {
  roomId: string;
  userId: string;
  send: (message: ClientMessage) => boolean;
}) {
  const key = noteDraftStorageKey(options.roomId, options.userId);
  const draftsRef = useRef<Map<string, NoteDraft>>(new Map());
  const shareWaitersRef = useRef(
    new Map<string, { phaseRevision: number; onSaved: () => void }>(),
  );
  const serverRef = useRef<ServerState>({
    ready: false,
    connected: false,
    phase: { kind: "lobby" },
    phaseRevision: 0,
    notes: new Map(),
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
      shareWaitersRef.current.clear();
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
      shareWaitersRef.current.delete(draft.noteId);
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

  const completeShareWaiter = useCallback(
    (noteId: string, content: string, contentRevision: number) => {
      const waiter = shareWaitersRef.current.get(noteId);
      if (!waiter) return;
      shareWaitersRef.current.delete(noteId);
      const server = serverRef.current;
      const note = server.notes.get(noteId);
      if (
        server.ready &&
        server.connected &&
        waiter.phaseRevision === server.phaseRevision &&
        server.phase.kind === "step" &&
        server.phase.step === 2 &&
        note?.visibility === "private" &&
        note.authorId === options.userId &&
        !note.excluded &&
        note.content === content &&
        note.contentRevision === contentRevision
      )
        waiter.onSaved();
    },
    [options.userId],
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
      if (!canContinueDraft(draft, server, options.userId)) {
        markRecovery(draft, "not-editable");
        return;
      }
      if (note.contentRevision !== draft.baseRevision) {
        markRecovery(draft, "conflict");
        return;
      }
      if (draft.committedText === draft.baseContent) {
        draftsRef.current.delete(noteId);
        completeShareWaiter(noteId, note.content, note.contentRevision);
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
      completeShareWaiter,
      markRecovery,
      options.send,
      options.userId,
      persist,
      repaint,
      requestStatus,
    ],
  );

  const saveBeforeShare = useCallback(
    (noteId: string, onSaved: () => void): void => {
      const server = serverRef.current;
      const note = server.notes.get(noteId);
      const draft = draftsRef.current.get(noteId);
      if (
        !server.ready ||
        !server.connected ||
        server.phase.kind !== "step" ||
        server.phase.step !== 2 ||
        note?.visibility !== "private" ||
        note.authorId !== options.userId ||
        note.excluded ||
        draft?.composing ||
        draft?.recoveryReason ||
        shareWaitersRef.current.has(noteId)
      )
        return;
      if (!draft) {
        onSaved();
        return;
      }
      shareWaitersRef.current.set(noteId, {
        phaseRevision: server.phaseRevision,
        onSaved,
      });
      flush(noteId);
      repaint();
    },
    [flush, options.userId, repaint],
  );

  const schedule = useCallback(
    (noteId: string, immediate = false) => {
      clearTimer(noteId);
      if (immediate) {
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
          phaseRevision: serverRef.current.phaseRevision,
          phase: server.phase,
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
          phaseRevision: serverRef.current.phaseRevision,
          phase: serverRef.current.phase,
          text: note.content,
          committedText: note.content,
          generation: 0,
          composing: false,
          inFlight: null,
          recoveryReason: null,
        };
        draftsRef.current.set(noteId, draft);
      }
      if (shareWaitersRef.current.delete(noteId)) repaint();
      draft.composing = true;
      clearTimer(noteId);
      persist();
    },
    [clearTimer, persist, repaint],
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
      if (draft.recoveryReason === "result-unknown")
        draft.recoveryReason = draft.composing
          ? "interrupted-composition"
          : null;
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
      if (draft.text === sent.content && !draft.composing) {
        draftsRef.current.delete(noteId);
        completeShareWaiter(noteId, sent.content, contentRevision);
      } else if (!canContinueDraft(draft, serverRef.current, options.userId))
        markRecovery(draft, "not-editable");
      else if (!draft.composing && !draft.recoveryReason)
        schedule(noteId, true);
      persist();
      repaint();
    },
    [
      clearStatusTimer,
      completeShareWaiter,
      markRecovery,
      options.userId,
      persist,
      repaint,
      schedule,
    ],
  );

  const stopRolledBackDrafts = useCallback(
    (rollbackRevision: number | undefined) => {
      if (rollbackRevision === undefined || rollbackRevision === 0) return;
      for (const draft of draftsRef.current.values()) {
        const draftPhaseRevision =
          draft.phaseRevision ?? draft.inFlight?.expectedPhaseRevision ?? 0;
        if (draftPhaseRevision >= rollbackRevision) continue;
        // 戻す操作で取り消された端末の編集も破棄する。
        // 遅れて届く成功通知はinFlight不一致となり、復元済み本文に反映しない。
        clearTimer(draft.noteId);
        clearStatusTimer(draft.noteId);
        draftsRef.current.delete(draft.noteId);
      }
      persist();
    },
    [clearTimer, clearStatusTimer, persist],
  );

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      const server = serverRef.current;
      if (message.type === "snapshot") {
        for (const [noteId, waiter] of shareWaitersRef.current)
          if (waiter.phaseRevision !== message.phaseRevision)
            shareWaitersRef.current.delete(noteId);
        stopRolledBackDrafts(message.rollbackRevision);
        server.ready = true;
        server.connected = true;
        server.phase = message.phase;
        server.phaseRevision = message.phaseRevision;
        server.notes = new Map(message.notes.map((note) => [note.id, note]));
        for (const draft of draftsRef.current.values()) {
          if (draft.recoveryReason === "send-failed") {
            draft.recoveryReason = null;
            persist();
          }
          // snapshotだけでは保存結果は分からない。照会中も文章を回収できるよう残す。
          if (draft.inFlight) {
            clearTimer(draft.noteId);
            if (!canContinueDraft(draft, server, options.userId))
              markRecovery(
                draft,
                draft.composing ? "interrupted-composition" : "not-editable",
              );
            sendStatus(draft);
            continue;
          }
          if (draft.recoveryReason) continue;
          if (draft.composing) {
            markRecovery(draft, "interrupted-composition");
          }
          if (draft.composing) continue;
          const note = server.notes.get(draft.noteId);
          if (!note) {
            markRecovery(draft, "missing");
            continue;
          }
          if (!canContinueDraft(draft, server, options.userId)) {
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
        if (
          !note ||
          !canContinueDraft(draft, server, options.userId) ||
          (draft.recoveryReason !== null &&
            draft.recoveryReason !== "result-unknown" &&
            draft.recoveryReason !== "send-failed")
        ) {
          markRecovery(draft, draft.recoveryReason ?? "not-editable");
          return;
        }
        if (note.contentRevision !== draft.inFlight.expectedContentRevision) {
          markRecovery(draft, "conflict");
          return;
        }
        if (draft.inFlight.expectedPhaseRevision !== server.phaseRevision) {
          clearStatusTimer(draft.noteId);
          draft.inFlight = null;
          if (draft.recoveryReason === "result-unknown")
            draft.recoveryReason = draft.composing
              ? "interrupted-composition"
              : null;
          persist();
          repaint();
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
        if (
          draft &&
          message.code === "forbidden" &&
          draft.inFlight &&
          draft.inFlight.expectedPhaseRevision !== server.phaseRevision &&
          canContinueDraft(draft, server, options.userId) &&
          server.notes.get(draft.noteId)?.contentRevision ===
            draft.baseRevision &&
          !draft.recoveryReason
        ) {
          sendStatus(draft);
          return;
        }
        if (draft)
          markRecovery(
            draft,
            message.code === "content-conflict" ? "conflict" : "not-editable",
          );
        return;
      }
      if (message.type === "phase:updated") {
        for (const [noteId, waiter] of shareWaitersRef.current)
          if (waiter.phaseRevision !== message.phaseRevision)
            shareWaitersRef.current.delete(noteId);
        stopRolledBackDrafts(message.rollbackRevision);
        server.phase = message.phase;
        server.phaseRevision = message.phaseRevision;
        for (const draft of draftsRef.current.values()) {
          clearTimer(draft.noteId);
          if (!canContinueDraft(draft, server, options.userId))
            markRecovery(draft, "not-editable");
          if (draft.inFlight) {
            sendStatus(draft);
            continue;
          }
          if (!draft.recoveryReason && !draft.composing)
            schedule(draft.noteId, true);
        }
        repaint();
      }
    },
    [
      accept,
      clearTimer,
      clearStatusTimer,
      markRecovery,
      options.send,
      options.userId,
      persist,
      repaint,
      requestStatus,
      schedule,
      sendStatus,
      stopRolledBackDrafts,
    ],
  );

  const setConnected = useCallback(
    (connected: boolean) => {
      if (!connected) {
        if (shareWaitersRef.current.size > 0) {
          shareWaitersRef.current.clear();
          repaint();
        }
        serverRef.current.connected = false;
        serverRef.current.ready = false;
        for (const timer of statusTimersRef.current.values())
          clearTimeout(timer);
        statusTimersRef.current.clear();
      }
    },
    [repaint],
  );
  const recoverDisconnected = useCallback(() => {
    setConnected(false);
    for (const draft of draftsRef.current.values())
      markRecovery(draft, draft.inFlight ? "result-unknown" : "not-editable");
  }, [markRecovery, setConnected]);
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
          : draft.recoveryReason === "result-unknown"
            ? "保存結果を確認できていません。再認証後に結果を確認します。"
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
    saveBeforeShare,
    sharingSavePending: shareWaitersRef.current.size > 0,
    compositionStart,
    compositionEnd,
    applyMessage,
    setConnected,
    recoverDisconnected,
    draftValue: (noteId: string) => {
      const draft = draftsRef.current.get(noteId);
      return draft && !draft.recoveryReason ? draft.text : undefined;
    },
    recoveries,
  };
}
