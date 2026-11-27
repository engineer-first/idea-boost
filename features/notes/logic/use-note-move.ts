"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_COORDINATE_LIMIT,
  DRAG_BROADCAST_THROTTLE_MS,
} from "@/contracts/board";
import { isPhaseStep } from "@/contracts/phase";
import type {
  ClientMessage,
  MoveCancelReason,
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
  // 共有の応答待ちの付箋を動かした操作。対象の版が決まる共有の確定まで RoomDO へ送らない。
  waitingShare?: true;
  // 古い版で断られ、送り直しを待っている。サーバーはこのidを知らない。
  blocked?: boolean;
  retries?: number;
  // 再接続の前に確定を送った先頭。切断で RoomDO が取り消していた・届いていなかったら、新しいidで送り直す。
  reconnected?: true;
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

// 1枚の移動は、相手の確定で版が進んでも本人が離す位置を保ったまま最新の版へ載せ替える。
// 複数枚は相対位置が崩れるため載せ替えない。
const MOVE_RETRY_LIMIT = 2;
function rebase(operation: Operation, latest: ProtocolNote): Operation {
  const [note] = operation.before;
  return {
    ...operation,
    before: [latest],
    delta: {
      x: note.x + operation.delta.x - latest.x,
      y: note.y + operation.delta.y - latest.y,
    },
  };
}
function rebaseable(
  operation: Operation,
  latest: ProtocolNote | undefined,
): latest is ProtocolNote {
  const [note] = operation.before;
  return (
    operation.before.length === 1 &&
    !operation.waitingShare &&
    latest !== undefined &&
    latest.id === note.id &&
    latest.visibility === "shared" &&
    (latest.visibilityRevision ?? 0) === (note.visibilityRevision ?? 0)
  );
}

export type MoveFeedback = { operationId: string; message: string };
/** 共有が確定した付箋の、RoomDO 上の位置と版。 */
export type SharedPosition = {
  x: number;
  y: number;
  positionRevision: number;
  visibilityRevision: number;
};
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
  // 列の先頭になった操作を RoomDO へ送り始める。
  const launch = useCallback(
    (operation: Operation) => {
      if (operation.waitingShare) return;
      sendStart(operation);
      if (operation.status === "pending")
        send({
          type: "note:move:commit",
          operationId: operation.id,
          delta: operation.delta,
        });
      else previewSender(operation);
    },
    [previewSender, send, sendStart],
  );
  // 先頭を新しいidで送り直す。古いidの遅れた結果は先頭と一致しないので無視される。
  const restart = useCallback(
    (queue: Operation[], cancelPrevious: boolean) => {
      const [head, ...rest] = queue;
      if (!head) return;
      // blockedのidはサーバーへ送っていないので、そのまま使う。
      const next: Operation = {
        ...head,
        id: head.blocked ? head.id : createId(),
        blocked: false,
      };
      previewSender.cancel();
      publish([next, ...rest], true);
      if (cancelPrevious)
        send({ type: "note:move:cancel", operationId: head.id });
      launch(next);
    },
    [createId, launch, previewSender, publish, send],
  );
  const retryRef = useRef(() => {});
  retryRef.current = () => {
    const [head, ...rest] = operationsRef.current;
    if (!head?.blocked) return;
    const latest = getNotes().find((note) => note.id === head.before[0]?.id);
    if (rebaseable(head, latest)) {
      restart([rebase(head, latest), ...rest], false);
      return;
    }
    publish([], true);
    setFeedback({
      operationId: head.id,
      message: "移動を確認できませんでした。もう一度操作してください。",
    });
  };
  // 通知を受けて取り消すときは reason を添え、RoomDO が本番で数える（#1401）。
  const cancel = useCallback(
    (noteId?: string, reason?: MoveCancelReason) => {
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
      if (head.waitingShare || head.blocked) {
        // RoomDO へ何も送っていないので、本人の表示から外すだけでよい。
        publish([], true);
        return;
      }
      if (head.status === "pending") {
        publish([head], true);
        send({ type: "note:move:status", operationId: head.id });
      } else {
        send(
          reason
            ? { type: "note:move:cancel", operationId: head.id, reason }
            : { type: "note:move:cancel", operationId: head.id },
        );
        publish([], true);
      }
    },
    [send, previewSender, publish],
  );
  // 盤面が掴みを取り消したとき。その付箋を掴んでいる途中でなければ（切断などで先に外れた）何もしない。
  const cancelDrag = useCallback(
    (noteId?: string) => {
      const last = operationsRef.current.at(-1);
      if (noteId && (last?.status !== "preview" || last.anchorId !== noteId))
        return;
      cancel(noteId);
    },
    [cancel],
  );
  // 接続が切れたら、掴んでいる途中の移動だけを外す。離し終えた移動は再接続の後に送る。
  // 切断したか。次の snapshot だけを再接続として扱う（接続中の snapshot は従来どおり取り消す）。
  const suspendedRef = useRef(false);
  const suspend = useCallback(() => {
    suspendedRef.current = true;
    const queue = operationsRef.current;
    const last = queue.at(-1);
    if (last?.status !== "preview") return;
    previewSender.cancel();
    if (queue.length === 1 && !last.waitingShare && !last.blocked)
      send({ type: "note:move:cancel", operationId: last.id });
    publish(queue.slice(0, -1), true);
  }, [previewSender, publish, send]);
  // 再接続の snapshot の後、送信できるようになったら、切れる前に確定を送った先頭の結果を照会する。
  const resume = useCallback(() => {
    const head = operationsRef.current[0];
    if (head?.reconnected && head.status === "pending")
      send({ type: "note:move:status", operationId: head.id });
  }, [send]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = operationsRef.current[0];
      if (!current || current.waitingShare) return;
      if (current.blocked) retryRef.current();
      else if (current.status === "pending")
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
      if (
        current?.status === "preview" &&
        !current.waitingShare &&
        !current.blocked
      )
        send({ type: "note:move:cancel", operationId: current.id });
    };
  }, [send, previewSender]);
  const start = useCallback(
    (
      noteId: string,
      selectedIds: readonly string[] = [noteId],
      // 共有の応答待ちの付箋を掴んだとき、本人の画面に出ている共有後の姿を渡す。
      pendingShare?: ProtocolNote,
    ) => {
      if (operationsRef.current.at(-1)?.status === "preview") return;
      if (!capability.current.enabled) {
        setFeedback({
          operationId: "unsupported",
          message: "サーバー更新前のため複数移動は利用できません。",
        });
        return;
      }
      const ids =
        !pendingShare && selectedIds.includes(noteId)
          ? [...new Set(selectedIds)]
          : [noteId];
      // 確定通知と次の入力が同じ描画にまとまっても、受信済みの版を使う。
      const displayed = renderMoves(
        pendingShare
          ? getNotes().map((note) =>
              note.id === pendingShare.id ? pendingShare : note,
            )
          : getNotes(),
        operationsRef.current,
      );
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
        ...(pendingShare ? { waitingShare: true as const } : {}),
      };
      const queue = operationsRef.current;
      publish([...queue, next], true);
      setFeedback(null);
      if (queue.length === 0 && !next.waitingShare) sendStart(next);
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
      if (queue.length === 1 && !next.waitingShare && !next.blocked)
        previewSender(next);
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
      if (queue.length === 1 && !next.waitingShare && !next.blocked)
        send({
          type: "note:move:commit",
          operationId: current.id,
          delta: current.delta,
        });
    },
    [move, previewSender, publish, send],
  );
  // 共有の結果が出たら、待たせていた移動を確定した版へ付け替えて送る。
  // 本人が離した位置を保つ。共有できなかったときは送らずに捨てる。
  const resolveShare = useCallback(
    (noteId: string, shared: SharedPosition | null) => {
      const queue = operationsRef.current;
      const waits = (operation: Operation) =>
        operation.waitingShare === true && operation.anchorId === noteId;
      if (!queue.some(waits)) return;
      const headWaited = waits(queue[0]);
      let first = true;
      const next = queue.flatMap((operation): Operation[] => {
        if (!waits(operation)) return [operation];
        if (!shared) return [];
        const { waitingShare: _, ...ready } = operation;
        const rebased = first;
        first = false;
        return [
          {
            ...ready,
            before: operation.before.map((note) => ({
              ...note,
              ...(rebased ? { x: shared.x, y: shared.y } : {}),
              visibility: "shared" as const,
              positionRevision: shared.positionRevision,
              visibilityRevision: shared.visibilityRevision,
            })),
            delta: rebased
              ? {
                  x: operation.before[0].x + operation.delta.x - shared.x,
                  y: operation.before[0].y + operation.delta.y - shared.y,
                }
              : operation.delta,
          },
        ];
      });
      if (!shared) previewSender.cancel();
      publish(next, true);
      if (headWaited && next[0]) launch(next[0]);
    },
    [launch, previewSender, publish],
  );
  const applyMessage = useCallback(
    (message: ServerMessage) => {
      peerMoves.applyMessage(message);
      const mapChanged =
        (message.type === "idea-map:state" ||
          message.type === "phase:updated") &&
        message.mapRevision !== undefined &&
        message.mapRevision !== capability.current.mapRevision;
      let resumed: Operation | undefined;
      let reconnecting = false;
      if (mapChanged) {
        const id = operationsRef.current.at(-1)?.id;
        cancel(
          undefined,
          message.type === "phase:updated" ? "phase-changed" : "map-changed",
        );
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
        const cap = capability.current;
        const queue = operationsRef.current;
        const wasSuspended = suspendedRef.current;
        suspendedRef.current = false;
        if (
          !wasSuspended ||
          queue.some(
            (operation) =>
              operation.phaseRevision !== cap.phaseRevision ||
              operation.mapRevision !== cap.mapRevision ||
              operation.space !== cap.space,
          )
        )
          cancel(undefined, "resynced");
        else if (queue.length > 0) {
          // 再接続。離し終えた移動は残し、掴んでいた途中の移動だけを外す。
          const kept = queue.filter(
            (operation) => operation.status !== "preview",
          );
          if (kept.length !== queue.length) previewSender.cancel();
          const [head, ...rest] = kept;
          resumed =
            head?.status === "pending" && !head.blocked && !head.waitingShare
              ? { ...head, reconnected: true }
              : undefined;
          reconnecting = true;
          publish(resumed ? [resumed, ...rest] : kept, true);
        }
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
        // 時間切れの後も RoomDO は共有付箋の移動を受け付ける。掴んでいる付箋を戻さない。
        (message.type === "timer:updated" &&
          message.timer.status !== "running" &&
          message.timer.status !== "ended") ||
        (message.type === "decision:updated" && message.decision !== null)
      ) {
        cancel(
          undefined,
          message.type === "phase:updated"
            ? "phase-changed"
            : message.type === "timer:updated"
              ? "timer-stopped"
              : "decided",
        );
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
      // 再接続の先頭が動かす付箋は、先頭の結果で版を進める。後ろで同じ付箋を動かす移動もその行き先を起点にする。
      const chained = new Set(resumed?.before.map((note) => note.id));
      const changedNotes =
        message.type === "note:updated"
          ? [message.note]
          : message.type === "notes:moved" && !ownBatch
            ? message.notes
            : message.type === "snapshot" && reconnecting
              ? message.notes.filter((note) => !chained.has(note.id))
              : [];
      const gone = (id: string) =>
        (message.type === "note:deleted" && message.noteId === id) ||
        (message.type === "snapshot" &&
          reconnecting &&
          !chained.has(id) &&
          !message.notes.some((note) => note.id === id));
      const conflicting = (operation: Operation, index: number) =>
        !(
          index === 0 &&
          operation.status === "pending" &&
          !operation.blocked
        ) &&
        // 共有の応答待ちの付箋はまだ非共有で届く（本文の保存の通知など）。競合と数えない。
        !operation.waitingShare &&
        operation.before.some(
          (note) =>
            gone(note.id) ||
            changedNotes.some(
              (changed) =>
                changed.id === note.id &&
                (changed.visibility !== "shared" ||
                  (changed.positionRevision ?? 0) !==
                    (note.positionRevision ?? 0) ||
                  (changed.visibilityRevision ?? 0) !==
                    (note.visibilityRevision ?? 0)),
            ),
        );
      const queue = operationsRef.current;
      const [first] = queue;
      if (first && queue.some(conflicting)) {
        // 成立しなくなった移動だけを外す。1枚の移動は最新の版へ載せ替え、
        // 関係のない移動（離し終えた未送信分・掴んでいる移動）は残す。
        // 後ろの移動は、前に並んだ移動の行き先を起点にしている。外した・載せ替えた移動の後ろで
        // 同じ付箋を動かす移動も、その付箋が直前にある位置と版（null は消えた）へ付け直す。
        const bases = new Map<string, ProtocolNote | null>();
        const latestNote = (id: string): ProtocolNote | null | undefined =>
          gone(id) ? null : changedNotes.find((note) => note.id === id);
        let dropped: Operation | undefined;
        const next = queue.flatMap((operation, index): Operation[] => {
          const tainted = operation.before.some((note) => bases.has(note.id));
          if (!conflicting(operation, index) && !tainted) return [operation];
          const [note] = operation.before;
          const base =
            (bases.has(note.id) ? bases.get(note.id) : latestNote(note.id)) ??
            undefined;
          if (rebaseable(operation, base)) {
            bases.set(note.id, {
              ...base,
              x: note.x + operation.delta.x,
              y: note.y + operation.delta.y,
            });
            return [rebase(operation, base)];
          }
          dropped ??= operation;
          for (const target of operation.before)
            if (!bases.has(target.id)) {
              const latest = latestNote(target.id);
              bases.set(target.id, latest === undefined ? target : latest);
            }
          return [];
        });
        if (!conflicting(first, 0)) publish(next, true);
        else if (next[0]?.id === first.id) restart(next, !first.blocked);
        else {
          // 先頭は掴んでいる途中か、送り直し待ち。送り直し待ちのidはサーバーが知らない。
          previewSender.cancel();
          if (!first.blocked)
            send({
              type: "note:move:cancel",
              operationId: first.id,
              reason: "note-changed",
            });
          publish(next, true);
          if (next[0]) launch(next[0]);
        }
        if (dropped)
          setFeedback({
            operationId: dropped.id,
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
      // 切断で RoomDO が取り消した（cancelled）・確定が届かなかった（unknown）・
      // 古い接続の操作が期限切れになった（expired）。どれも確定は適用されていない。
      if (
        (message.status === "cancelled" ||
          message.status === "unknown" ||
          message.status === "expired") &&
        current.reconnected
      ) {
        const { reconnected: _, ...head } = current;
        restart([head, ...operationsRef.current.slice(1)], false);
        return;
      }
      const latest = getNotes().find(
        (note) => note.id === current.before[0]?.id,
      );
      const retries = (current.retries ?? 0) + 1;
      if (
        message.status === "rejected" &&
        retries <= MOVE_RETRY_LIMIT &&
        rebaseable(current, latest)
      ) {
        const stale = (operation: Operation) =>
          operation.before[0]?.id === latest.id &&
          (operation.before[0]?.positionRevision ?? 0) !==
            (latest.positionRevision ?? 0) &&
          rebaseable(operation, latest);
        const rest = operationsRef.current
          .slice(1)
          .map((operation) =>
            stale(operation) ? rebase(operation, latest) : operation,
          );
        if (stale(current))
          restart([{ ...rebase(current, latest), retries }, ...rest], false);
        // 相手が掴んでいる間は、相手の確定か2秒後の照会で送り直す。
        // 断られたidへ先に送ったpreview・commitのunknownと取り違えないよう、新しいidで待つ。
        else
          publish(
            [{ ...current, id: createId(), blocked: true, retries }, ...rest],
            true,
          );
        return;
      }
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
      if (waiting[0]) launch(waiting[0]);
    },
    [
      cancel,
      createId,
      getNotes,
      launch,
      publish,
      restart,
      send,
      updateNotes,
      previewSender,
      peerMoves.applyMessage,
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
  // 位置を移動の表示が決めている付箋。共有の応答待ちの表示が位置を上書きしないために使う。
  const movedNoteIds = useMemo(
    () =>
      new Set(
        operations.flatMap((operation) =>
          operation.before.map((note) => note.id),
        ),
      ),
    [operations],
  );
  const last = operations.at(-1);
  return {
    notes: renderedNotes,
    movedNoteIds,
    resolveShare,
    draggingNoteId: last?.status === "preview" ? last.anchorId : null,
    frontNoteId: last?.anchorId ?? null,
    pending: operations.some((operation) => operation.status === "pending"),
    feedback,
    receipt,
    enabled,
    owns,
    suspend,
    resume,
    applyMessage,
    clearPeerMoves: peerMoves.clear,
    start,
    move,
    end,
    cancel,
    cancelDrag,
  };
}
