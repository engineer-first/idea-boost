import type {
  ClientMessage,
  ServerMessage,
  ShareReceipt,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import { isRoomClosed } from "./completed-rooms";
import { getDecision } from "./decisions";
import type { HandlerCtx } from "./handler-context";
import { isMember } from "./members";
import { hasMoveLock } from "./move-operations";
import { findNote, type NoteRow } from "./notes";
import {
  getBoardMutationForbiddenMessage,
  getPhase,
  getPhaseRevision,
} from "./phase";

type ShareMessage = Extract<
  ClientMessage,
  { type: "note:publish" | "note:unpublish" }
>;
type Result = Extract<ServerMessage, { type: "note:share:result" }>;
type Stored = { user_id: string; result_json: string; created_at: number };
const RETENTION_MS = 24 * 60 * 60 * 1000;
function stored(ctx: HandlerCtx, operationId: string): Stored | undefined {
  return ctx.sql
    .exec(
      "SELECT user_id,result_json,created_at FROM note_share_operations WHERE operation_id=?1",
      operationId,
    )
    .toArray()[0] as Stored | undefined;
}
export function replyShareStatus(
  ctx: HandlerCtx,
  operationId: string,
): boolean {
  const row = stored(ctx, operationId);
  if (!row) return false;
  if (!isMember(ctx.sql, ctx.userId) || row.user_id !== ctx.userId) {
    ctx.reply({ type: "note:share:result", operationId, status: "unknown" });
    return true;
  }
  const result = JSON.parse(row.result_json) as Result;
  const phase = getPhase(ctx.sql);
  const note = result.receipt ? findNote(ctx.sql, result.receipt.noteId) : null;
  if (Date.now() - row.created_at > RETENTION_MS) {
    ctx.reply({ type: "note:share:result", operationId, status: "expired" });
  } else if (
    result.receipt &&
    (phase.kind !== "step" ||
      !note ||
      note.phase !== phase.phase ||
      note.author_id !== ctx.userId)
  ) {
    ctx.reply({
      type: "note:share:result",
      operationId,
      status: result.status,
    });
  } else ctx.reply(result);
  return true;
}
function position(row: NoteRow): ShareReceipt["before"] {
  return {
    visibility: row.visibility,
    x: row.x,
    y: row.y,
    positionRevision: row.position_revision ?? 0,
    visibilityRevision: row.visibility_revision ?? 0,
  };
}
// 同期DB変更とreceiptを一つのtransactionに収め、可視性配信はcommit後に行う。
export function commitShare(
  ctx: HandlerCtx,
  message: ShareMessage,
  mutate: (ctx: HandlerCtx, message: ShareMessage) => void,
): void {
  const operationId = message.operationId;
  if (!operationId) return;
  if (replyShareStatus(ctx, operationId)) return;
  const phase = getPhase(ctx.sql);
  const row = findNote(ctx.sql, message.noteId);
  const owner = ctx.broadcaster.findActiveDrag(message.noteId);
  const recent = Number(
    ctx.sql
      .exec(
        "SELECT COUNT(*) AS count FROM note_share_operations WHERE user_id=?1 AND created_at>?2",
        ctx.userId,
        Date.now() - 60_000,
      )
      .one().count,
  );
  if (recent >= 60) {
    ctx.reply({
      type: "note:share:result",
      operationId,
      status: "rejected",
      reason: "共有操作が多すぎます。少し待ってから操作してください。",
    });
    return;
  }
  const permitted =
    recent < 60 &&
    isMember(ctx.sql, ctx.userId) &&
    !isRoomClosed(ctx.sql) &&
    phase.kind === "step" &&
    phase.step === 2 &&
    !getDecision(ctx.sql, phase.phase) &&
    !getBoardMutationForbiddenMessage(phase, message) &&
    row &&
    row.author_id === ctx.userId &&
    row.phase === phase.phase &&
    !row.excluded &&
    row.visibility ===
      (message.type === "note:publish" ? "private" : "shared") &&
    message.expectedPhaseRevision === getPhaseRevision(ctx.sql) &&
    message.expectedPositionRevision === (row.position_revision ?? 0) &&
    message.expectedVisibilityRevision === (row.visibility_revision ?? 0) &&
    !hasMoveLock(ctx.sql, message.noteId) &&
    (!owner || owner.socket === ctx.ws) &&
    (message.type !== "note:publish" ||
      phase.phase !== 3 ||
      (message.x >= 0 &&
        message.x <= 100 &&
        message.y >= 0 &&
        message.y <= 100));
  let result: Result = {
    type: "note:share:result",
    operationId,
    status: "rejected",
    reason:
      "共有対象の権限・工程・位置が変更されています。もう一度操作してください。",
  };
  const notifications: (() => void)[] = [];
  // ハンドラで使用するbroadcastだけを遅延し、認可照会は実broadcasterで行う。
  const broadcaster = new Proxy(ctx.broadcaster, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      if (String(key).startsWith("broadcast"))
        return (...args: unknown[]) =>
          notifications.push(() => Reflect.apply(value, target, args));
      return value.bind(target);
    },
  }) as RoomBroadcaster;
  ctx.storage.transactionSync(() => {
    if (permitted && row) {
      const clean = { ...message, operationId: undefined };
      let rejected = false;
      mutate(
        {
          ...ctx,
          broadcaster,
          reply: (reply) => {
            if (reply.type === "error") rejected = true;
          },
        },
        clean,
      );
      const after = findNote(ctx.sql, message.noteId);
      if (!rejected && after)
        result = {
          type: "note:share:result",
          operationId,
          status: "committed",
          receipt: {
            operationId,
            noteId: row.id,
            phaseRevision: getPhaseRevision(ctx.sql),
            before: position(row),
            after: position(after),
            ...(message.type === "note:unpublish" &&
            message.privateIndex !== undefined
              ? { privateIndex: message.privateIndex }
              : {}),
          },
        };
    }
    ctx.sql.exec(
      "INSERT INTO note_share_operations(operation_id,user_id,result_json,created_at) VALUES (?1,?2,?3,?4)",
      operationId,
      ctx.userId,
      JSON.stringify(result),
      Date.now(),
    );
  });
  for (const notify of notifications) notify();
  ctx.reply(result);
}
