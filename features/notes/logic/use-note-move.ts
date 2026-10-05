"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_COORDINATE_LIMIT,
  DRAG_BROADCAST_THROTTLE_MS,
} from "@/contracts/board";
import type {
  ClientMessage,
  MoveReceipt,
  ProtocolNote,
  ServerMessage,
} from "@/contracts/room-protocol";
import { createThrottled } from "@/lib/throttle";

import { usePeerNoteMoves } from "./use-peer-note-moves";

type Operation = {
  id: string;
  anchorId: string;
  before: ProtocolNote[];
  delta: { x: number; y: number };
  phaseRevision: number;
  space: "canvas" | "map";
  status: "preview" | "pending";
};
type Capability = {
  enabled: boolean;
  phaseRevision: number;
  groupRevision: number;
  mapRevision: number;
  space: "canvas" | "map";
};
export type MoveFeedback = { operationId: string; message: string };
export function useNoteMove({
  notes,
  send,
  createId,
  updateNotes,
}: {
  notes: ProtocolNote[];
  send: (message: ClientMessage) => void;
  createId: () => string;
  updateNotes: (update: (notes: ProtocolNote[]) => ProtocolNote[]) => unknown;
}) {
  const peerMoves = usePeerNoteMoves(notes);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const capability = useRef<Capability>({
    enabled: false,
    phaseRevision: 0,
    groupRevision: 0,
    mapRevision: 0,
    space: "canvas",
  });
  const operationRef = useRef<Operation | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<MoveFeedback | null>(null);
  const [receipt, setReceipt] = useState<MoveReceipt | null>(null);
  const frameRef = useRef<number | null>(null);
  const previewSender = useMemo(
    () =>
      createThrottled(
        (value: Operation) =>
          send({
            type: "note:move:preview",
            operationId: value.id,
            delta: value.delta,
          }),
        DRAG_BROADCAST_THROTTLE_MS,
      ),
    [send],
  );
  const publish = useCallback((next: Operation | null, immediate = false) => {
    operationRef.current = next;
    if (immediate) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setOperation(next ? { ...next } : null);
    } else if (frameRef.current === null)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const current = operationRef.current;
        setOperation(current ? { ...current } : null);
      });
  }, []);
  const cancel = useCallback(
    (noteId?: string) => {
      const current = operationRef.current;
      if (!current || (noteId && noteId !== current.anchorId)) return;
      // pointerup後は取消ではなく結果照会。連打やEscapeで別の操作を開始しない。
      if (current.status === "pending") {
        send({ type: "note:move:status", operationId: current.id });
        return;
      }
      previewSender.cancel();
      send({ type: "note:move:cancel", operationId: current.id });
      publish(null, true);
    },
    [send, previewSender, publish],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      const current = operationRef.current;
      if (!current) return;
      if (current.status === "pending")
        send({ type: "note:move:status", operationId: current.id });
      else
        send({
          type: "note:move:preview",
          operationId: current.id,
          delta: current.delta,
        });
    }, 2_000);
    return () => {
      clearInterval(timer);
      previewSender.cancel();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      const current = operationRef.current;
      if (current?.status === "preview")
        send({ type: "note:move:cancel", operationId: current.id });
    };
  }, [send, previewSender]);
  const start = useCallback(
    (noteId: string, selectedIds: readonly string[] = [noteId]) => {
      if (operationRef.current) return;
      if (!capability.current.enabled) {
        setFeedback({
          operationId: "unsupported",
          message: "サーバー更新前のため複数移動は利用できません。",
        });
        return;
      }
      const ids = selectedIds.includes(noteId)
        ? [...new Set(selectedIds)]
        : [noteId];
      const before = ids.flatMap((id) => {
        const note = notesRef.current.find((note) => note.id === id);
        return note ? [note] : [];
      });
      if (
        before.length !== ids.length ||
        before.some((note) => note.visibility !== "shared")
      )
        return;
      const cap = capability.current;
      const next: Operation = {
        id: createId(),
        anchorId: noteId,
        before,
        delta: { x: 0, y: 0 },
        phaseRevision: cap.phaseRevision,
        space: cap.space,
        status: "preview",
      };
      publish(next, true);
      setFeedback(null);
      send({
        type: "note:move:start",
        operationId: next.id,
        expectedPhaseRevision: cap.phaseRevision,
        expectedGroupRevision: cap.groupRevision,
        expectedMapRevision: cap.mapRevision,
        coordinateSpace: cap.space,
        targets: before.map((note) => ({
          noteId: note.id,
          positionRevision: note.positionRevision ?? 0,
          visibilityRevision: note.visibilityRevision ?? 0,
        })),
      });
    },
    [send, createId, publish],
  );
  const move = useCallback(
    (noteId: string, x: number, y: number) => {
      const current = operationRef.current;
      if (
        !current ||
        current.anchorId !== noteId ||
        current.status !== "preview"
      )
        return;
      const anchor = current.before.find((note) => note.id === noteId);
      if (!anchor) return;
      const min = current.space === "map" ? 0 : -CANVAS_COORDINATE_LIMIT;
      const max = current.space === "map" ? 100 : CANVAS_COORDINATE_LIMIT;
      const delta = {
        x: Math.max(
          min - Math.min(...current.before.map((n) => n.x)),
          Math.min(
            max - Math.max(...current.before.map((n) => n.x)),
            x - anchor.x,
          ),
        ),
        y: Math.max(
          min - Math.min(...current.before.map((n) => n.y)),
          Math.min(
            max - Math.max(...current.before.map((n) => n.y)),
            y - anchor.y,
          ),
        ),
      };
      const next = { ...current, delta };
      publish(next);
      previewSender(next);
    },
    [previewSender, publish],
  );
  const end = useCallback(
    (noteId: string, x: number, y: number) => {
      move(noteId, x, y);
      const current = operationRef.current;
      if (
        !current ||
        current.anchorId !== noteId ||
        current.status !== "preview"
      )
        return;
      previewSender.cancel();
      const next: Operation = { ...current, status: "pending" };
      publish(next, true);
      send({
        type: "note:move:commit",
        operationId: current.id,
        delta: current.delta,
      });
    },
    [move, previewSender, publish, send],
  );
  const applyMessage = useCallback(
    (message: ServerMessage) => {
      peerMoves.applyMessage(message);
      const activePreview = operationRef.current;
      if (
        activePreview?.status === "preview" &&
        (((message.type === "idea-map:state" ||
          message.type === "phase:updated") &&
          message.mapRevision !== undefined &&
          message.mapRevision !== capability.current.mapRevision) ||
          ((message.type === "group:updated" ||
            message.type === "group:deleted" ||
            message.type === "group:revision") &&
            message.groupRevision !== undefined &&
            message.groupRevision !== capability.current.groupRevision))
      ) {
        cancel();
        setFeedback({
          operationId: activePreview.id,
          message:
            "盤面の分類や広さが変更されました。もう一度操作してください。",
        });
      }
      if (message.type === "snapshot") {
        capability.current = {
          enabled: message.moveProtocolVersion === 1,
          phaseRevision: message.phaseRevision,
          groupRevision: message.groupRevision ?? 0,
          mapRevision: message.mapRevision ?? 0,
          space:
            message.phase.kind === "step" && message.phase.phase === 3
              ? "map"
              : "canvas",
        };
        const current = operationRef.current;
        if (current?.status === "pending")
          send({ type: "note:move:status", operationId: current.id });
        else if (current) cancel();
      }
      if (message.type === "notes:moved")
        capability.current.groupRevision = message.groupRevision;
      if (
        (message.type === "group:updated" ||
          message.type === "group:deleted" ||
          message.type === "group:revision" ||
          message.type === "phase:updated") &&
        message.groupRevision !== undefined
      )
        capability.current.groupRevision = message.groupRevision;
      if (
        (message.type === "idea-map:state" ||
          message.type === "phase:updated") &&
        message.mapRevision !== undefined
      )
        capability.current.mapRevision = message.mapRevision;
      if (message.type === "phase:updated") {
        capability.current.phaseRevision = message.phaseRevision;
        capability.current.space =
          message.phase.kind === "step" && message.phase.phase === 3
            ? "map"
            : "canvas";
      }
      if (
        message.type === "phase:updated" ||
        message.type === "outcome:published" ||
        (message.type === "decision:updated" && message.decision !== null)
      ) {
        const current = operationRef.current;
        if (current?.status === "preview") cancel();
        else if (current) {
          send({ type: "note:move:status", operationId: current.id });
          publish({ ...current, delta: { x: 0, y: 0 } }, true);
        }
      }
      const current = operationRef.current;
      if (
        current?.status === "preview" &&
        ((message.type === "note:deleted" &&
          current.before.some((note) => note.id === message.noteId)) ||
          (message.type === "note:updated" &&
            current.before.some(
              (note) =>
                note.id === message.note.id &&
                (note.positionRevision !== message.note.positionRevision ||
                  note.visibilityRevision !== message.note.visibilityRevision),
            )))
      ) {
        cancel();
        setFeedback({
          operationId: current.id,
          message: "移動対象が変更されました。もう一度操作してください。",
        });
      }
      if (
        current &&
        message.type === "error" &&
        message.operationId === current.id
      ) {
        if (current.status === "pending") {
          // エラーへの即時再照会はerror→statusの応答ループになる。
          // commitは再送せず、2秒timerまたは再接続snapshotで照会する。
          return;
        }
        previewSender.cancel();
        publish(null, true);
        setFeedback({ operationId: current.id, message: message.message });
        return;
      }
      if (
        message.type !== "note:move:result" ||
        !current ||
        message.operationId !== current.id
      )
        return;
      // 確定送信後は照会だけ。遅延start ACKやactive結果をcommit再送の根拠にしない。
      if (message.status === "active") return;

      previewSender.cancel();
      if (message.status === "accepted" && message.receipt) {
        const saved = message.receipt;
        capability.current.groupRevision = Math.max(
          capability.current.groupRevision,
          saved.groupRevisionAfter,
        );
        if (capability.current.phaseRevision === saved.phaseRevision)
          updateNotes((notes) =>
            notes.map((note) => {
              const position = saved.after.find(
                (target) => target.noteId === note.id,
              );
              return position &&
                (note.positionRevision ?? 0) <= position.positionRevision &&
                (note.visibilityRevision ?? 0) === position.visibilityRevision
                ? {
                    ...note,
                    x: position.x,
                    y: position.y,
                    positionRevision: position.positionRevision,
                  }
                : note;
            }),
          );
        if (saved.changed) setReceipt(saved);
      } else if (message.status === "accepted") {
        // 成功は保持するが不可視receiptの代わりに前の操作の逆操作情報を公開しない。
        setReceipt(null);
      } else if (message.status !== "cancelled")
        setFeedback({
          operationId: current.id,
          message:
            message.reason ??
            "移動を確認できませんでした。もう一度操作してください。",
        });
      publish(null, true);
    },
    [send, cancel, publish, updateNotes, previewSender, peerMoves.applyMessage],
  );
  const renderedNotes = useMemo(() => {
    if (!operation) return peerMoves.notes;
    const origins = new Map(operation.before.map((note) => [note.id, note]));
    return peerMoves.notes.map((note) => {
      const origin = origins.get(note.id);
      return origin
        ? {
            ...note,
            x: origin.x + operation.delta.x,
            y: origin.y + operation.delta.y,
          }
        : note;
    });
  }, [peerMoves.notes, operation]);
  const enabled = useCallback(() => capability.current.enabled, []);
  const owns = useCallback(
    (id?: string) =>
      Boolean(
        operationRef.current && (!id || operationRef.current.anchorId === id),
      ),
    [],
  );
  return {
    notes: renderedNotes,
    draggingNoteId: operation?.status === "preview" ? operation.anchorId : null,
    frontNoteId: operation?.anchorId ?? null,
    pending: operation?.status === "pending",
    feedback,
    receipt,
    enabled,
    owns,
    applyMessage,
    clearPeerMoves: peerMoves.clear,
    start,
    move,
    end,
    cancel,
  };
}
