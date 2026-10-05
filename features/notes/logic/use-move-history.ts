"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  MoveReceipt,
  ProtocolNote,
  ServerMessage,
} from "@/contracts/room-protocol";

type Target = MoveReceipt["affected"][number];
type Entry = {
  source: MoveReceipt;
  expected: Target[];
  groupRevision: number;
  reason?: string;
};
export type MoveHistoryActionState = {
  label: string;
  reason: string;
  disabled: boolean;
};
const emptyReason = "戻せる移動履歴がありません。";
const conflictReason = "ほかの人の変更があるため、この移動は戻せません。";
export function useMoveHistory({
  send,
  connected,
  blocked,
  createId = () => crypto.randomUUID(),
  notes = [],
  currentUserId,
}: {
  send: (message: ClientMessage) => unknown;
  connected: boolean;
  blocked: boolean;
  createId?: () => string;
  notes?: ProtocolNote[];
  currentUserId?: string;
}) {
  const entries = useRef<Entry[]>([]);
  const cursor = useRef(0);
  const ownMoves = useRef(new Set<string>());
  const localBatches = useRef(new Map<string, string>());
  const localGroupRevision = useRef<number | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const boundaryRequests = useRef<ClientMessage[]>([]);
  const pending = useRef<{
    id: string;
    index: number;
    direction: "undo" | "redo";
    generation: number;
    errorReason?: string;
  } | null>(null);
  const generation = useRef(0);
  const reason = useRef(emptyReason);
  const options = useRef({ connected, blocked });
  options.current = { connected, blocked };
  const [, render] = useState(0);
  const refresh = useCallback(() => render((n) => n + 1), []);
  const clear = useCallback(
    (message = "移動以外の操作が確定したため、移動履歴を終了しました。") => {
      // 履歴終了は送信済み逆操作の取消を意味しない。現在状態はsnapshot/batchで同期し、
      // 遅延結果で旧cursorを復活させず、旧pendingで新しい訪問を塞がない。
      pending.current = null;
      entries.current = [];
      ownMoves.current.clear();
      boundaryRequests.current = [];
      localBatches.current.clear();
      localGroupRevision.current = null;
      cursor.current = 0;
      generation.current++;
      reason.current = message;
      refresh();
    },
    [refresh],
  );
  const observeOutgoing = useCallback((message: ClientMessage) => {
    if (message.type === "note:move:start")
      ownMoves.current.add(message.operationId);
    else if (
      [
        "host:transfer",
        "note:create",
        "note:delete",
        "note:publish",
        "note:unpublish",
        "note:update-content",
        "note:update-font-size",
        "note:exclude",
        "note:restore",
        "note:bulk-exclude",
        "note:bulk-restore",
        "group:create",
        "group:update-name",
        "idea-map:resize",
        "note:vote",
        "note:vote-reset",
        "note:vote-remove",
        "note:vote-sticker:add",
        "note:vote-sticker:move",
        "note:vote-sticker:remove",
      ].includes(message.type)
    )
      boundaryRequests.current.push(message);
  }, []);
  const applyMessage = useCallback(
    (message: ServerMessage) => {
      if (
        message.type === "snapshot" ||
        message.type === "phase:updated" ||
        message.type === "outcome:published" ||
        (message.type === "decision:updated" && message.decision !== null)
      )
        clear("工程や接続が変わったため、移動履歴を終了しました。");
      const boundary = boundaryRequests.current.find((request) => {
        if (message.type === "error") return false;
        if (
          "operationId" in request &&
          request.operationId &&
          "operationId" in message &&
          message.operationId === request.operationId
        )
          return (
            !("status" in message) ||
            ["accepted", "committed"].includes(message.status)
          );
        if (request.type === "note:create")
          return (
            message.type === "note:inserted" &&
            (!currentUserId || message.note.authorId === currentUserId)
          );
        if (request.type === "note:delete")
          return (
            message.type === "note:deleted" && message.noteId === request.noteId
          );
        if (
          request.type === "note:publish" ||
          request.type === "note:unpublish"
        )
          return (
            (message.type === "note:updated" ||
              message.type === "note:inserted") &&
            message.note.id === request.noteId &&
            message.note.visibility ===
              (request.type === "note:publish" ? "shared" : "private")
          );
        if (request.type === "note:exclude" || request.type === "note:restore")
          return (
            message.type === "note:updated" &&
            message.note.id === request.noteId &&
            message.note.excluded === (request.type === "note:exclude")
          );
        if (
          request.type === "group:create" ||
          request.type === "group:update-name"
        )
          return (
            message.type === "group:updated" &&
            (request.type === "group:create"
              ? message.group.id === request.group.id
              : message.group.id === request.groupId &&
                message.group.name === request.name)
          );
        if (request.type === "idea-map:resize")
          return message.type === "idea-map:state";
        if (request.type === "note:bulk-exclude")
          return message.type === "note:bulk-excluded";
        return false;
      });
      if (boundary) {
        const remaining = boundaryRequests.current.filter(
          (r) => r !== boundary,
        );
        clear();
        boundaryRequests.current = remaining;
      }
      if (
        "status" in message &&
        ["rejected", "expired"].includes(message.status) &&
        "operationId" in message
      ) {
        boundaryRequests.current = boundaryRequests.current.filter(
          (r) => !("operationId" in r && r.operationId === message.operationId),
        );
      }
      if (message.type === "error" && !message.operationId)
        boundaryRequests.current = boundaryRequests.current.filter(
          (r) => "operationId" in r && r.operationId,
        );
      if (message.type === "error" && message.operationId)
        boundaryRequests.current = boundaryRequests.current.filter(
          (r) => !("operationId" in r && r.operationId === message.operationId),
        );
      if (message.type === "notes:moved") {
        const ours =
          message.operationId &&
          (ownMoves.current.has(message.operationId) ||
            pending.current?.id === message.operationId);
        if (ours) localGroupRevision.current = message.groupRevision;
        if (ours)
          for (const note of message.notes)
            localBatches.current.set(
              note.id,
              `${note.positionRevision ?? 0}:${note.visibilityRevision ?? 0}`,
            );
        else
          for (const entry of entries.current)
            if (
              entry.expected.some((t) =>
                message.notes.some(
                  (n) =>
                    n.id === t.noteId &&
                    ((n.positionRevision ?? 0) !== t.positionRevision ||
                      (n.visibilityRevision ?? 0) !== t.visibilityRevision),
                ),
              )
            )
              entry.reason = conflictReason;
        refresh();
      }
      if (message.type === "note:deleted" || message.type === "note:updated") {
        for (const entry of entries.current)
          if (
            entry.expected.some((t) =>
              message.type === "note:deleted"
                ? t.noteId === message.noteId
                : t.noteId === message.note.id &&
                  localBatches.current.get(t.noteId) !==
                    `${message.note.positionRevision ?? 0}:${message.note.visibilityRevision ?? 0}` &&
                  ((message.note.positionRevision ?? 0) !==
                    t.positionRevision ||
                    (message.note.visibilityRevision ?? 0) !==
                      t.visibilityRevision),
            )
          )
            entry.reason = conflictReason;
        refresh();
      }
      if (
        (message.type === "group:updated" ||
          message.type === "group:deleted") &&
        message.groupRevision !== localGroupRevision.current
      ) {
        const id =
          message.type === "group:updated" ? message.group.id : message.groupId;
        for (const entry of entries.current)
          if (
            [...entry.source.groupsBefore, ...entry.source.groupsAfter].some(
              (g) => g.id === id,
            )
          )
            entry.reason = conflictReason;
        refresh();
      }
      if (
        message.type === "error" &&
        pending.current &&
        pending.current.id === message.operationId
      ) {
        // ACK喪失後の再要求の拒否でもありうるため、error単独では成功/拒否を決めない。
        // 同じIDの保存済み結果を照会し、unknownとの組合せだけを不存在の終端にする。
        pending.current.errorReason = message.message;
        send({ type: "note:move:status", operationId: pending.current.id });
        return;
      }
      if (message.type !== "note:move:result") return;
      const active = pending.current;
      if (active?.id === message.operationId) {
        if (
          message.status === "active" ||
          (message.status === "unknown" && !active.errorReason)
        )
          return;
        pending.current = null;
        const entry = entries.current[active.index];
        if (
          message.status === "accepted" &&
          message.receipt &&
          active.generation === generation.current &&
          entry
        ) {
          const saved = message.receipt;
          entry.source = saved;
          entry.expected = saved.affected;
          entry.groupRevision = saved.groupRevisionAfter;
          cursor.current += active.direction === "undo" ? -1 : 1;
          for (const other of entries.current) {
            other.expected = other.expected.map((t) => {
              const before = saved.before.find((b) => b.noteId === t.noteId);
              const after = saved.after.find((a) => a.noteId === t.noteId);
              return before &&
                after &&
                t.positionRevision === before.positionRevision &&
                t.visibilityRevision === before.visibilityRevision
                ? { ...t, positionRevision: after.positionRevision }
                : t;
            });
            if (other.groupRevision === saved.groupRevisionBefore)
              other.groupRevision = saved.groupRevisionAfter;
          }
        } else if (entry && active.generation === generation.current)
          entry.reason = message.reason ?? active.errorReason ?? conflictReason;
        refresh();
        return;
      }
      if (
        !ownMoves.current.has(message.operationId) ||
        message.status === "active"
      )
        return;
      ownMoves.current.delete(message.operationId);
      if (message.status === "accepted" && message.receipt?.changed) {
        const saved = message.receipt;
        for (const entry of entries.current) {
          entry.expected = entry.expected.map((t) => {
            const before = saved.before.find((b) => b.noteId === t.noteId);
            const after = saved.after.find((a) => a.noteId === t.noteId);
            return before &&
              after &&
              t.positionRevision === before.positionRevision &&
              t.visibilityRevision === before.visibilityRevision
              ? { ...t, positionRevision: after.positionRevision }
              : t;
          });
          if (entry.groupRevision === saved.groupRevisionBefore)
            entry.groupRevision = saved.groupRevisionAfter;
        }
        entries.current = entries.current.slice(0, cursor.current);
        entries.current.push({
          source: saved,
          expected: saved.affected,
          groupRevision: saved.groupRevisionAfter,
        });
        cursor.current = entries.current.length;
      }
      refresh();
    },
    [clear, refresh, currentUserId, send],
  );
  const state = (direction: "undo" | "redo"): MoveHistoryActionState => {
    const entry =
      entries.current[
        direction === "undo" ? cursor.current - 1 : cursor.current
      ];
    const explanation = !connected
      ? "接続を待っています。"
      : pending.current
        ? "移動の結果を確認しています。"
        : blocked
          ? "操作中は移動履歴を実行できません。"
          : (entry?.reason ?? (!entry ? reason.current : ""));
    const action = direction === "undo" ? "移動を元に戻す" : "移動をやり直す";
    return {
      label: entry
        ? `${action}（${entry.source.before.length}枚: ${entry.source.before.map((t) => notesRef.current.find((n) => n.id === t.noteId)?.content.slice(0, 20) || t.noteId).join("、")}）`
        : action,
      reason: explanation,
      disabled: Boolean(explanation),
    };
  };
  const execute = useCallback(
    (direction: "undo" | "redo") => {
      const index = direction === "undo" ? cursor.current - 1 : cursor.current;
      const entry = entries.current[index];
      if (
        !entry ||
        entry.reason ||
        pending.current ||
        !options.current.connected ||
        options.current.blocked
      )
        return;
      const id = createId();
      pending.current = {
        id,
        index,
        direction,
        generation: generation.current,
      };
      refresh();
      send({
        type: "note:move:inverse",
        operationId: id,
        sourceOperationId: entry.source.operationId,
        expectedTargets: entry.expected,
        expectedGroupRevision: entry.groupRevision,
      });
    },
    [createId, send, refresh],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (pending.current && options.current.connected)
        send({ type: "note:move:status", operationId: pending.current.id });
    }, 2000);
    return () => clearInterval(timer);
  }, [send]);
  return {
    undoState: state("undo"),
    redoState: state("redo"),
    pending: Boolean(pending.current),
    undo: () => execute("undo"),
    redo: () => execute("redo"),
    observeOutgoing,
    applyMessage,
    clear,
  };
}
