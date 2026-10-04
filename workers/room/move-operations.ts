// 未確定座標はDBへ保存しない。固定集合・版・lock・receiptをDO SQLiteで所有する。

import { CANVAS_COORDINATE_LIMIT } from "../../contracts/board";
import { reorganizeGroups } from "../../contracts/grouping";
import { isPhaseStep } from "../../contracts/phase";
import type {
  ClientMessage,
  MoveReceipt,
  ServerMessage,
} from "../../contracts/room-protocol";
import { projectNoteForViewer } from "../visibility";
import type { RoomBroadcaster, SocketAttachment } from "./broadcast";
import { isRoomClosed } from "./completed-rooms";
import { getDecision } from "./decisions";
import {
  canViewBoardGroup,
  listBoardGroups,
  listGroups,
  saveGroups,
} from "./groups";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { broadcastIdeaMapState, isIdeaMapVisiblePhase } from "./idea-map";
import { isMember } from "./members";
import {
  broadcastNoteUpdated,
  findNote,
  isVisibleTo,
  listSharedNotes,
  type NoteRow,
  nextStackOrder,
  toProtocolNote,
} from "./notes";
import {
  getBoardMutationForbiddenMessage,
  getPhase,
  getPhaseRevision,
} from "./phase";

type Start = Extract<ClientMessage, { type: "note:move:start" }>;
type Result = Extract<ServerMessage, { type: "note:move:result" }>;
type Operation = {
  operation_id: string;
  user_id: string;
  connection_id: string;
  request_json: string;
  state: Result["status"];
  lease_until: number;
  result_json: string | null;
};
type StoredRequest = { start: Start; before: MoveReceipt["before"] };
export const MOVE_LEASE_MS = 15_000;
export const MOVE_RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

export function moveRevisions(sql: SqlStorage): {
  groupRevision: number;
  mapRevision: number;
} {
  const row = sql
    .exec("SELECT group_revision, map_revision FROM room_state WHERE id=1")
    .one();
  return {
    groupRevision: Number(row.group_revision),
    mapRevision: Number(row.map_revision),
  };
}
function readOperation(sql: SqlStorage, id: string): Operation | undefined {
  return sql
    .exec("SELECT * FROM note_move_operations WHERE operation_id=?1", id)
    .toArray()[0] as Operation | undefined;
}
function finish(sql: SqlStorage, operationId: string, result: Result): void {
  sql.exec(
    "UPDATE note_move_operations SET state=?2,result_json=?3 WHERE operation_id=?1",
    operationId,
    result.status,
    JSON.stringify(result),
  );
  sql.exec("DELETE FROM note_move_locks WHERE operation_id=?1", operationId);
}
export function expireMoveOperations(sql: SqlStorage, now = Date.now()): void {
  for (const row of sql
    .exec(
      "SELECT operation_id FROM note_move_operations WHERE state='active' AND lease_until<=?1",
      now,
    )
    .toArray()) {
    finish(sql, String(row.operation_id), {
      type: "note:move:result",
      operationId: String(row.operation_id),
      status: "expired",
      reason:
        "移動の接続確認が期限切れになりました。もう一度操作してください。",
    });
  }
  // IDの墓標は残し、古い再送を新規操作として確定しない。本文を含まないreceiptも期限で破棄。
  sql.exec(
    "UPDATE note_move_operations SET request_json='{}',result_json=NULL,state='expired' WHERE state<>'active' AND created_at<?1 AND request_json<>'{}'",
    now - MOVE_RECEIPT_RETENTION_MS,
  );
}
export function hasMoveLock(sql: SqlStorage, noteId?: string): boolean {
  expireMoveOperations(sql);
  return (
    (noteId
      ? sql.exec("SELECT 1 FROM note_move_locks WHERE note_id=?1", noteId)
      : sql.exec("SELECT 1 FROM note_move_locks LIMIT 1")
    ).toArray().length > 0
  );
}
export function releaseUserMoves(sql: SqlStorage, userId: string): void {
  for (const row of sql
    .exec(
      "SELECT operation_id FROM note_move_operations WHERE user_id=?1 AND state='active'",
      userId,
    )
    .toArray())
    finish(sql, String(row.operation_id), {
      type: "note:move:result",
      operationId: String(row.operation_id),
      status: "cancelled",
    });
}
export function releaseConnectionMoves(
  sql: SqlStorage,
  connectionId: string,
): void {
  for (const row of sql
    .exec(
      "SELECT operation_id FROM note_move_operations WHERE connection_id=?1 AND state='active'",
      connectionId,
    )
    .toArray())
    finish(sql, String(row.operation_id), {
      type: "note:move:result",
      operationId: String(row.operation_id),
      status: "cancelled",
    });
}

// presenceは入力されたnote IDだけで認可しない。保存済み操作の全対象と
// 所有接続・工程・専用版・lockを検証し、秘密の対象混合やstale集合を配信しない。
function presenceOperation(
  sql: SqlStorage,
  attachment: SocketAttachment,
): StoredRequest | null {
  if (
    !attachment.activeMoveOperationId ||
    !attachment.moveConnectionId ||
    !isMember(sql, attachment.userId) ||
    isRoomClosed(sql)
  )
    return null;
  const op = readOperation(sql, attachment.activeMoveOperationId);
  if (
    op?.state !== "active" ||
    op.lease_until <= Date.now() ||
    op.user_id !== attachment.userId ||
    op.connection_id !== attachment.moveConnectionId
  )
    return null;
  const request = JSON.parse(op.request_json) as StoredRequest;
  const phase = getPhase(sql);
  const revisions = moveRevisions(sql);
  if (
    phase.kind !== "step" ||
    getDecision(sql, phase.phase) ||
    request.start.expectedPhaseRevision !== getPhaseRevision(sql) ||
    request.start.expectedGroupRevision !== revisions.groupRevision ||
    request.start.expectedMapRevision !== revisions.mapRevision ||
    getBoardMutationForbiddenMessage(phase, {
      type: "note:move",
      noteId: "",
      x: 0,
      y: 0,
    })
  )
    return null;
  const locks = sql
    .exec(
      "SELECT note_id FROM note_move_locks WHERE operation_id=?1",
      op.operation_id,
    )
    .toArray();
  if (locks.length !== request.start.targets.length) return null;
  for (const target of request.start.targets) {
    const row = findNote(sql, target.noteId);
    if (
      row?.visibility !== "shared" ||
      row.phase !== phase.phase ||
      (row.position_revision ?? 0) !== target.positionRevision ||
      (row.visibility_revision ?? 0) !== target.visibilityRevision ||
      !locks.some((lock) => lock.note_id === target.noteId)
    )
      return null;
  }
  return request;
}
export function canShareMovePresence(ctx: HandlerCtx, noteId: string): boolean {
  const attachment = ctx.ws.deserializeAttachment() as SocketAttachment | null;
  if (!attachment || attachment.userId !== ctx.userId) return false;
  return (
    presenceOperation(ctx.sql, attachment)?.start.targets.some(
      (target) => target.noteId === noteId,
    ) ?? false
  );
}
export function syncMovePresence(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
): number {
  const retired = broadcaster.retireMovePresence((attachment) => {
    if (presenceOperation(sql, attachment)) return true;
    const op = attachment.activeMoveOperationId
      ? readOperation(sql, attachment.activeMoveOperationId)
      : undefined;
    if (op?.state === "active")
      finish(sql, op.operation_id, {
        type: "note:move:result",
        operationId: op.operation_id,
        status: "cancelled",
      });
    return false;
  });
  if (retired > 0) broadcastIdeaMapState(sql, broadcaster);
  return retired;
}

function connectionId(ctx: HandlerCtx): string {
  const attachment = ctx.ws.deserializeAttachment() as SocketAttachment;
  if (attachment.moveConnectionId) return attachment.moveConnectionId;
  const id = crypto.randomUUID();
  ctx.ws.serializeAttachment({
    ...attachment,
    moveConnectionId: id,
  } satisfies SocketAttachment);
  return id;
}
function storedResult(op: Operation): Result {
  return op.result_json
    ? (JSON.parse(op.result_json) as Result)
    : {
        type: "note:move:result",
        operationId: op.operation_id,
        status: op.state,
      };
}
// 完全receiptの内容は保存時のまま。現在不可視な1件があれば全体を伏せる。
// 成功を拒否へ変更せず、逆操作情報だけをfail-closedにする。
function resultFor(ctx: HandlerCtx, op: Operation): Result {
  const result = storedResult(op);
  const receipt = result.receipt;
  if (!receipt) return result;
  const phase = getPhase(ctx.sql);
  const ids = new Set(
    [...receipt.before, ...receipt.after, ...receipt.affected].map(
      (note) => note.noteId,
    ),
  );
  for (const group of [...receipt.groupsBefore, ...receipt.groupsAfter])
    for (const id of group.noteIds) ids.add(id);
  const visible =
    isMember(ctx.sql, ctx.userId) &&
    phase.kind === "step" &&
    [...ids].every((id) => {
      const note = findNote(ctx.sql, id);
      return (
        note !== null &&
        note.phase === phase.phase &&
        isVisibleTo(note, ctx.userId)
      );
    }) &&
    (phase.phase !== 2 ||
      (receipt.groupsBefore.length === 0 && receipt.groupsAfter.length === 0));
  return visible
    ? result
    : {
        type: "note:move:result",
        operationId: result.operationId,
        status: result.status,
      };
}
function changedGroups(
  before: MoveReceipt["groupsBefore"],
  after: MoveReceipt["groupsAfter"],
): { before: MoveReceipt["groupsBefore"]; after: MoveReceipt["groupsAfter"] } {
  const equivalent = (
    a: MoveReceipt["groupsBefore"][number],
    b: MoveReceipt["groupsBefore"][number],
  ) =>
    a.id === b.id &&
    a.name === b.name &&
    JSON.stringify(a.noteIds) === JSON.stringify(b.noteIds);
  return {
    before: before.filter(
      (group) => !after.some((next) => equivalent(group, next)),
    ),
    after: after.filter(
      (group) => !before.some((prev) => equivalent(prev, group)),
    ),
  };
}

function reject(
  ctx: HandlerCtx,
  operationId: string,
  reason = "移動対象の権限・位置・分類が変更されています。もう一度操作してください。",
  existing = false,
): void {
  const result: Result = {
    type: "note:move:result",
    operationId,
    status: "rejected",
    reason,
  };
  if (existing) {
    finish(ctx.sql, operationId, result);
    syncMovePresence(ctx.sql, ctx.broadcaster);
  }
  ctx.reply(result);
}
function permitted(ctx: HandlerCtx): boolean {
  const phase = getPhase(ctx.sql);
  return (
    !isRoomClosed(ctx.sql) &&
    isMember(ctx.sql, ctx.userId) &&
    !getBoardMutationForbiddenMessage(phase, {
      type: "note:move",
      noteId: "",
      x: 0,
      y: 0,
    }) &&
    phase.kind === "step" &&
    !getDecision(ctx.sql, phase.phase)
  );
}
function position(row: NoteRow): MoveReceipt["before"][number] {
  return {
    noteId: row.id,
    x: row.x,
    y: row.y,
    positionRevision: row.position_revision ?? 0,
    visibilityRevision: row.visibility_revision ?? 0,
  };
}
function validate(ctx: HandlerCtx, request: StoredRequest): NoteRow[] | null {
  const { start } = request;
  const phase = getPhase(ctx.sql);
  const revisions = moveRevisions(ctx.sql);
  if (
    !permitted(ctx) ||
    phase.kind !== "step" ||
    start.expectedPhaseRevision !== getPhaseRevision(ctx.sql) ||
    start.expectedGroupRevision !== revisions.groupRevision ||
    start.expectedMapRevision !== revisions.mapRevision ||
    start.coordinateSpace !== (phase.phase === 3 ? "map" : "canvas")
  )
    return null;
  const rows: NoteRow[] = [];
  for (const target of start.targets) {
    const row = findNote(ctx.sql, target.noteId);
    if (
      row?.visibility !== "shared" ||
      row.phase !== phase.phase ||
      (row.position_revision ?? 0) !== target.positionRevision ||
      (row.visibility_revision ?? 0) !== target.visibilityRevision ||
      ctx.broadcaster.findActiveDrag(row.id)
    )
      return null;
    rows.push(row);
  }
  return rows;
}
function activeOperation(
  ctx: HandlerCtx,
  id: string,
): { op: Operation; request: StoredRequest; rows: NoteRow[] } | null {
  expireMoveOperations(ctx.sql);
  const op = readOperation(ctx.sql, id);
  if (!op || op.user_id !== ctx.userId) {
    ctx.reply({ type: "note:move:result", operationId: id, status: "unknown" });
    return null;
  }
  if (op.state !== "active") {
    ctx.reply(resultFor(ctx, op));
    return null;
  }
  if (op.connection_id !== connectionId(ctx)) {
    reject(ctx, id, "別の接続からこの移動を確定できません。");
    return null;
  }
  const request = JSON.parse(op.request_json) as StoredRequest;
  const rows = validate(ctx, request);
  const locks = ctx.sql
    .exec("SELECT note_id FROM note_move_locks WHERE operation_id=?1", id)
    .toArray();
  if (!rows || locks.length !== request.start.targets.length) {
    reject(ctx, id, undefined, true);
    return null;
  }
  return { op, request, rows };
}
function clampDelta(
  rows: NoteRow[],
  delta: { x: number; y: number },
  map: boolean,
): { x: number; y: number } {
  const min = map ? 0 : -CANVAS_COORDINATE_LIMIT;
  const max = map ? 100 : CANVAS_COORDINATE_LIMIT;
  return {
    x: Math.max(
      min - Math.min(...rows.map((r) => r.x)),
      Math.min(max - Math.max(...rows.map((r) => r.x)), delta.x),
    ),
    y: Math.max(
      min - Math.min(...rows.map((r) => r.y)),
      Math.min(max - Math.max(...rows.map((r) => r.y)), delta.y),
    ),
  };
}
export const moveHandlers: MessageHandlers<
  | "note:move:start"
  | "note:move:preview"
  | "note:move:cancel"
  | "note:move:commit"
  | "note:move:status"
> = {
  "note:move:start": (ctx, message) => {
    expireMoveOperations(ctx.sql);
    const previous = readOperation(ctx.sql, message.operationId);
    if (previous) {
      if (previous.user_id !== ctx.userId) {
        reject(ctx, message.operationId);
        return;
      }
      if (
        previous.state === "active" &&
        (previous.connection_id !== connectionId(ctx) ||
          JSON.stringify(
            (JSON.parse(previous.request_json) as StoredRequest).start,
          ) !== JSON.stringify(message))
      ) {
        reject(ctx, message.operationId);
        return;
      }
      ctx.reply(resultFor(ctx, previous));
      return;
    }
    const recent = Number(
      ctx.sql
        .exec(
          "SELECT COUNT(*) AS count FROM note_move_operations WHERE user_id=?1 AND created_at>?2",
          ctx.userId,
          Date.now() - 60_000,
        )
        .one().count,
    );
    const unique = new Set(message.targets.map((t) => t.noteId));
    const request: StoredRequest = { start: message, before: [] };
    const rows = validate(ctx, request);
    if (
      recent >= 60 ||
      unique.size !== message.targets.length ||
      !rows ||
      rows.some(
        (row) =>
          ctx.sql
            .exec("SELECT 1 FROM note_move_locks WHERE note_id=?1", row.id)
            .toArray().length > 0,
      )
    ) {
      reject(ctx, message.operationId);
      return;
    }
    request.before = rows.map(position);
    ctx.storage.transactionSync(() => {
      ctx.sql.exec(
        "INSERT INTO note_move_operations(operation_id,user_id,connection_id,request_json,state,lease_until,created_at) VALUES (?1,?2,?3,?4,'active',?5,?6)",
        message.operationId,
        ctx.userId,
        connectionId(ctx),
        JSON.stringify(request),
        Date.now() + MOVE_LEASE_MS,
        Date.now(),
      );
      for (const row of rows)
        ctx.sql.exec(
          "INSERT INTO note_move_locks(note_id,operation_id) VALUES (?1,?2)",
          row.id,
          message.operationId,
        );
    });
    ctx.ws.serializeAttachment({
      ...(ctx.ws.deserializeAttachment() as SocketAttachment),
      activeMoveOperationId: message.operationId,
    } satisfies SocketAttachment);
    if (isIdeaMapVisiblePhase(getPhase(ctx.sql)))
      broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
    ctx.reply({
      type: "note:move:result",
      operationId: message.operationId,
      status: "active",
    });
  },
  "note:move:preview": (ctx, message) => {
    if (!activeOperation(ctx, message.operationId)) return;
    ctx.sql.exec(
      "UPDATE note_move_operations SET lease_until=?2 WHERE operation_id=?1",
      message.operationId,
      Date.now() + MOVE_LEASE_MS,
    );
    // peer previewは任意。私的状態や確定note:updatedへ混ぜず、本人はローカルだけで描画する。
  },
  "note:move:cancel": (ctx, message) => {
    expireMoveOperations(ctx.sql);
    const op = readOperation(ctx.sql, message.operationId);
    if (!op || op.user_id !== ctx.userId) {
      ctx.reply({
        type: "note:move:result",
        operationId: message.operationId,
        status: "unknown",
      });
      return;
    }
    if (op.state === "active" && op.connection_id === connectionId(ctx))
      finish(ctx.sql, message.operationId, {
        type: "note:move:result",
        operationId: message.operationId,
        status: "cancelled",
      });
    syncMovePresence(ctx.sql, ctx.broadcaster);
    ctx.reply(
      resultFor(ctx, readOperation(ctx.sql, message.operationId) ?? op),
    );
  },
  "note:move:status": (ctx, message) => {
    expireMoveOperations(ctx.sql);
    let op = readOperation(ctx.sql, message.operationId);
    if (
      op?.user_id === ctx.userId &&
      op.state === "active" &&
      isRoomClosed(ctx.sql)
    ) {
      finish(ctx.sql, message.operationId, {
        type: "note:move:result",
        operationId: message.operationId,
        status: "cancelled",
      });
      op = readOperation(ctx.sql, message.operationId);
    }
    syncMovePresence(ctx.sql, ctx.broadcaster);
    ctx.reply(
      op?.user_id === ctx.userId
        ? resultFor(ctx, op)
        : {
            type: "note:move:result",
            operationId: message.operationId,
            status: "unknown",
          },
    );
  },
  "note:move:commit": (ctx, message) => {
    const active = activeOperation(ctx, message.operationId);
    if (!active) return;
    const { request, rows } = active;
    const delta = clampDelta(
      rows,
      message.delta,
      request.start.coordinateSpace === "map",
    );
    const changed = delta.x !== 0 || delta.y !== 0;
    const groupsBefore = listGroups(ctx.sql);
    let receipt: MoveReceipt;
    try {
      receipt = ctx.storage.transactionSync(() => {
        if (changed) {
          const now = new Date().toISOString();
          // 集合内の相対stack順を保ち、一操作につき一度だけ前面化する。
          for (const row of [...rows].sort(
            (a, b) => a.stack_order - b.stack_order || a.id.localeCompare(b.id),
          ))
            ctx.sql.exec(
              "UPDATE notes SET x=?2,y=?3,stack_order=?4,updated_at=?5 WHERE id=?1",
              row.id,
              row.x + delta.x,
              row.y + delta.y,
              nextStackOrder(ctx.sql),
              now,
            );
          if (isPhaseStep(getPhase(ctx.sql), 1, 3))
            saveGroups(
              ctx.storage,
              reorganizeGroups(listSharedNotes(ctx.sql), groupsBefore),
            );
        }
        const after = rows.map((row) =>
          position(findNote(ctx.sql, row.id) ?? row),
        );
        const changes = changedGroups(groupsBefore, listGroups(ctx.sql));
        // 不可視な分類を副作用で変更する場合は位置も含めて全rollback。
        if (
          ![...changes.before, ...changes.after].every(
            (group) =>
              canViewBoardGroup(
                ctx.sql,
                ctx.userId,
                group,
                getPhase(ctx.sql),
              ) &&
              group.noteIds.every(
                (id) => findNote(ctx.sql, id)?.visibility === "shared",
              ),
          )
        )
          throw new Error("invisible group side effect");
        const affectedIds = new Set([
          ...rows.map((row) => row.id),
          ...changes.before.flatMap((group) => group.noteIds),
          ...changes.after.flatMap((group) => group.noteIds),
        ]);
        const result: MoveReceipt = {
          operationId: message.operationId,
          phaseRevision: request.start.expectedPhaseRevision,
          coordinateSpace: request.start.coordinateSpace,
          before: request.before,
          after,
          groupsBefore: changes.before,
          groupsAfter: changes.after,
          groupRevisionBefore: request.start.expectedGroupRevision,
          groupRevisionAfter: moveRevisions(ctx.sql).groupRevision,
          mapRevision: request.start.expectedMapRevision,
          affected: [...affectedIds].flatMap((id) => {
            const row = findNote(ctx.sql, id);
            return row
              ? [
                  {
                    noteId: row.id,
                    positionRevision: row.position_revision ?? 0,
                    visibilityRevision: row.visibility_revision ?? 0,
                  },
                ]
              : [];
          }),
          changed,
        };
        finish(ctx.sql, message.operationId, {
          type: "note:move:result",
          operationId: message.operationId,
          status: "accepted",
          receipt: result,
        });
        return result;
      });
    } catch {
      reject(
        ctx,
        message.operationId,
        "移動を保存できませんでした。もう一度操作してください。",
        true,
      );
      return;
    }
    syncMovePresence(ctx.sql, ctx.broadcaster);
    // 確定後だけ配信。対象は全件shared検証済み。atomicなnote配列を一frameで畳み込む。
    ctx.broadcaster.broadcastMoveBatch((viewerId) => ({
      type: "notes:moved",
      notes: rows.map((row) =>
        projectNoteForViewer(
          { viewerId, phase: getPhase(ctx.sql) },
          toProtocolNote(ctx.sql, findNote(ctx.sql, row.id) ?? row, viewerId),
        ),
      ),
      groups: listBoardGroups(ctx.sql, viewerId, getPhase(ctx.sql)),
      groupRevision: receipt.groupRevisionAfter,
    }));
    // 旧clientも確定座標を受信するがpreviewを確定保存と誤認しない。
    for (const row of rows) {
      const current = findNote(ctx.sql, row.id);
      if (current) broadcastNoteUpdated(ctx.sql, ctx.broadcaster, current);
    }
    const afterIds = new Set(receipt.groupsAfter.map((g) => g.id));
    for (const group of receipt.groupsBefore)
      if (!afterIds.has(group.id))
        ctx.broadcaster.broadcastGroup(
          {
            type: "group:deleted",
            groupRevision: receipt.groupRevisionAfter,
            groupId: group.id,
          },
          (viewerId) =>
            canViewBoardGroup(ctx.sql, viewerId, group, getPhase(ctx.sql)),
        );
    for (const group of receipt.groupsAfter)
      ctx.broadcaster.broadcastGroup(
        {
          type: "group:updated",
          group,
          groupRevision: receipt.groupRevisionAfter,
        },
        (viewerId) =>
          canViewBoardGroup(ctx.sql, viewerId, group, getPhase(ctx.sql)),
      );
    const saved = readOperation(ctx.sql, message.operationId);
    if (saved) ctx.reply(resultFor(ctx, saved));
    if (changed) ctx.onSharedDragEnd?.();
  },
};
