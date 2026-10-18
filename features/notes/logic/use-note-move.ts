"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_COORDINATE_LIMIT,
  DRAG_BROADCAST_THROTTLE_MS,
} from "@/contracts/board";
import { isPhaseStep } from "@/contracts/phase";
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
  mapRevision: number;
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
// 表示だけに未確定の移動を重ねる。確定notes・分類・履歴は変更しない。
function renderMoves(
  notes: ProtocolNote[],
  operations: Operation[],
): ProtocolNote[] {
  const positions = new Map<string, { x: number; y: number }>();
  for (const operation of operations)
    for (const note of operation.before)
      positions.set(note.id, {
        x: note.x + operation.delta.x,
        y: note.y + operation.delta.y,
      });
  return notes.map((note) => {
    const position = positions.get(note.id);
    return position ? { ...note, ...position } : note;
  });
}

// 本人の先行操作で更新された版だけを後続へ引き継ぐ。掴んだ座標は保つ。
function advanceVersions(
  operations: Operation[],
  before: MoveReceipt["before"],
  after: MoveReceipt["after"],
): Operation[] {
  return operations.map((operation) => ({
    ...operation,
    before: operation.before.map((note) => {
      const previous = before.find((target) => target.noteId === note.id);
      const saved = after.find((target) => target.noteId === note.id);
      return previous &&
        saved &&
        (note.positionRevision ?? 0) === previous.positionRevision &&
        (note.visibilityRevision ?? 0) === previous.visibilityRevision
        ? {
            ...note,
            positionRevision: saved.positionRevision,
            visibilityRevision: saved.visibilityRevision,
          }
        : note;
    }),
  }));
}

export type MoveFeedback = { operationId: string; message: string };
export function useNoteMove({
  notes,
  getNotes,
  send,
  createId,
  updateNotes,
}: {
  notes: ProtocolNote[];
  getNotes: () => ProtocolNote[];
  send: (message: ClientMessage) => void;
  createId: () => string;
  updateNotes: (update: (notes: ProtocolNote[]) => ProtocolNote[]) => void;
}) {
  const peerMoves = usePeerNoteMoves(notes);
  const capability = useRef<Capability>({
    enabled: false,
    phaseRevision: 0,
    groupRevision: 0,
    mapRevision: 0,
    space: "canvas",
  });
  const operationsRef = useRef<Operation[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
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
  const publish = useCallback((next: Operation[], immediate = false) => {
    operationsRef.current = next;
    if (immediate) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setOperations(next);
    } else if (frameRef.current === null)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setOperations(operationsRef.current);
      });
  }, []);
  const sendStart = useCallback(
    (operation: Operation) => {
      send({
        type: "note:move:start",
        operationId: operation.id,
        expectedPhaseRevision: operation.phaseRevision,
        expectedGroupRevision: capability.current.groupRevision,
        expectedMapRevision: operation.mapRevision,
        coordinateSpace: operation.space,
        targets: operation.before.map((note) => ({
          noteId: note.id,
          positionRevision: note.positionRevision ?? 0,
          visibilityRevision: note.visibilityRevision ?? 0,
        })),
      });
    },
    [send],
  );
  const cancel = useCallback(
    (noteId?: string) => {
      const queue = operationsRef.current;
      const head = queue[0];
      if (
        !head ||
        (noteId && !queue.some((operation) => operation.anchorId === noteId))
      )
        return;
      const last = queue.at(-1);
      previewSender.cancel();
      // 対象付きの取消は今掴んでいる1操作だけ。Escape等は未送信分をすべて破棄する。
      if (
        noteId &&
        last?.status === "preview" &&
        last.anchorId === noteId &&
        queue.length > 1
      ) {
        publish(queue.slice(0, -1), true);
        return;
      }
      if (head.status === "pending") {
        publish([head], true);
        send({ type: "note:move:status", operationId: head.id });
      } else {
        send({ type: "note:move:cancel", operationId: head.id });
        publish([], true);
      }
    },
    [send, previewSender, publish],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      const current = operationsRef.current[0];
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
      const current = operationsRef.current[0];
      if (current?.status === "preview")
        send({ type: "note:move:cancel", operationId: current.id });
    };
  }, [send, previewSender]);
  const start = useCallback(
    (noteId: string, selectedIds: readonly string[] = [noteId]) => {
      if (operationsRef.current.at(-1)?.status === "preview") return;
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
      // 確定通知と次の入力が同じ描画にまとまっても、受信済みの版を使う。
      const displayed = renderMoves(getNotes(), operationsRef.current);
      const before = ids.flatMap((id) => {
        const note = displayed.find((note) => note.id === id);
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
        mapRevision: cap.mapRevision,
        space: cap.space,
        status: "preview",
      };
      const queue = operationsRef.current;
      publish([...queue, next], true);
      setFeedback(null);
      if (queue.length === 0) sendStart(next);
    },
    [createId, getNotes, publish, sendStart],
  );
  const move = useCallback(
    (noteId: string, x: number, y: number) => {
      const queue = operationsRef.current;
      const current = queue.at(-1);
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
      publish([...queue.slice(0, -1), next]);
      if (queue.length === 1) previewSender(next);
    },
    [previewSender, publish],
  );
  const end = useCallback(
    (noteId: string, x: number, y: number) => {
      move(noteId, x, y);
      const queue = operationsRef.current;
      const current = queue.at(-1);
      if (
        !current ||
        current.anchorId !== noteId ||
        current.status !== "preview"
      )
        return;
      previewSender.cancel();
      const next: Operation = {
        ...current,
        status: "pending",
      };
      publish([...queue.slice(0, -1), next], true);
      if (queue.length === 1)
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
      const mapChanged =
        (message.type === "idea-map:state" ||
          message.type === "phase:updated") &&
        message.mapRevision !== undefined &&
        message.mapRevision !== capability.current.mapRevision;
      if (mapChanged) {
        const id = operationsRef.current.at(-1)?.id;
        cancel();
        if (id)
          setFeedback({
            operationId: id,
            message: "盤面の広さが変更されました。もう一度操作してください。",
          });
      }
      if (message.type === "snapshot") {
        capability.current = {
          enabled: message.moveProtocolVersion === 1,
          phaseRevision: message.phaseRevision,
          groupRevision: message.groupRevision ?? 0,
          mapRevision: message.mapRevision ?? 0,
          space:
            isPhaseStep(message.phase, 3, 2) ||
            isPhaseStep(message.phase, 3, 3) ||
            isPhaseStep(message.phase, 3, 5)
              ? "map"
              : "canvas",
        };
        cancel();
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
          isPhaseStep(message.phase, 3, 2) ||
          isPhaseStep(message.phase, 3, 3) ||
          isPhaseStep(message.phase, 3, 5)
            ? "map"
            : "canvas";
      }
      if (
        message.type === "phase:updated" ||
        message.type === "outcome:published" ||
        (message.type === "timer:updated" &&
          message.timer.status !== "running") ||
        (message.type === "decision:updated" && message.decision !== null)
      ) {
        cancel();
        const head = operationsRef.current[0];
        if (head) publish([{ ...head, delta: { x: 0, y: 0 } }], true);
      }
      const head = operationsRef.current[0];
      const ownBatch =
        message.type === "notes:moved" && head?.id === message.operationId;
      if (ownBatch && head) {
        publish([
          head,
          ...advanceVersions(
            operationsRef.current.slice(1),
            head.before.map((note) => ({
              noteId: note.id,
              x: note.x,
              y: note.y,
              positionRevision: note.positionRevision ?? 0,
              visibilityRevision: note.visibilityRevision ?? 0,
            })),
            message.notes.map((note) => ({
              noteId: note.id,
              x: note.x,
              y: note.y,
              positionRevision: note.positionRevision ?? 0,
              visibilityRevision: note.visibilityRevision ?? 0,
            })),
          ),
        ]);
      }
      const changedNotes =
        message.type === "note:updated"
          ? [message.note]
          : message.type === "notes:moved" && !ownBatch
            ? message.notes
            : [];
      const conflict = operationsRef.current.find(
        (operation, index) =>
          !(index === 0 && operation.status === "pending") &&
          operation.before.some(
            (note) =>
              (message.type === "note:deleted" && message.noteId === note.id) ||
              changedNotes.some(
                (changed) =>
                  changed.id === note.id &&
                  (changed.visibility !== "shared" ||
                    (changed.positionRevision ?? 0) !==
                      (note.positionRevision ?? 0) ||
                    (changed.visibilityRevision ?? 0) !==
                      (note.visibilityRevision ?? 0)),
              ),
          ),
      );
      if (conflict) {
        cancel();
        setFeedback({
          operationId: conflict.id,
          message: "移動対象が変更されました。もう一度操作してください。",
        });
      }
      const current = operationsRef.current[0];
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
        publish([], true);
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
      const waiting =
        message.status === "accepted" &&
        message.receipt &&
        capability.current.phaseRevision === message.receipt.phaseRevision
          ? advanceVersions(
              operationsRef.current.slice(1),
              message.receipt.before,
              message.receipt.after,
            )
          : [];
      publish(waiting, true);
      const next = waiting[0];
      if (next) {
        sendStart(next);
        if (next.status === "pending")
          send({
            type: "note:move:commit",
            operationId: next.id,
            delta: next.delta,
          });
        else previewSender(next);
      }
    },
    [
      send,
      cancel,
      publish,
      updateNotes,
      previewSender,
      peerMoves.applyMessage,
      sendStart,
    ],
  );
  const renderedNotes = useMemo(
    () => renderMoves(peerMoves.notes, operations),
    [peerMoves.notes, operations],
  );
  const enabled = useCallback(() => capability.current.enabled, []);
  const owns = useCallback(
    (id?: string) =>
      operationsRef.current.some(
        (operation) => !id || operation.anchorId === id,
      ),
    [],
  );
  const last = operations.at(-1);
  return {
    notes: renderedNotes,
    draggingNoteId: last?.status === "preview" ? last.anchorId : null,
    frontNoteId: last?.anchorId ?? null,
    pending: operations.some((operation) => operation.status === "pending"),
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
