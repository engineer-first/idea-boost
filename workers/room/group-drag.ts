import {
  calculateRenderGroups,
  clampGroupDelta,
  getGroupMoveTargets,
} from "../../contracts/grouping";
import { isPhaseStep } from "../../contracts/phase";
import { syncRoomAlarm } from "./alarms";
import type {
  ActiveDragOwner,
  RoomBroadcaster,
  SocketAttachment,
} from "./broadcast";
import {
  hasReachedNoteDragStartRateLimit,
  recordUsedNoteDragId,
} from "./drag-operations";
import { autoReorganize, listGroups } from "./groups";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { findNotes, listSharedNotes, toProtocolNote } from "./notes";
import { getPhase } from "./phase";

export const GROUP_DRAG_MAX_DURATION_MS = 60_000;

/** 接続を維持したまま終了されない移動も期限で解放し、最後の確定位置を共有する。 */
export function expireGroupDrags(
  sql: SqlStorage,
  storage: DurableObjectStorage,
  broadcaster: RoomBroadcaster,
  now = Date.now(),
): boolean {
  let expired = false;
  for (const active of broadcaster.activeGroupDrags()) {
    if (
      (active.group?.expiresAt ?? 0) > now ||
      broadcaster.activeDragFor(active.socket)?.dragId !== active.dragId
    )
      continue;
    const retired = broadcaster.retireActiveDrag(active.socket);
    if (!retired?.group) continue;
    expired = true;
    broadcastGroupDrag(sql, broadcaster, retired, true);
    broadcaster.broadcastToAllExcept(
      { type: "cursor:drag-ended", userId: retired.attachment.userId },
      retired.attachment.userId,
    );
  }
  if (expired && isPhaseStep(getPhase(sql), 1, 3))
    autoReorganize(storage, broadcaster);
  return expired;
}

/** 全対象が共有中であることを確認し、最後の確定位置と表示枠を受信者ごとに配信する。 */
export function broadcastGroupDrag(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  active: ActiveDragOwner,
  ended: boolean,
): void {
  const group = active.group;
  if (!group) return;
  const rows = findNotes(
    sql,
    group.positions.map(({ noteId }) => noteId),
  );
  if (
    rows.length !== group.positions.length ||
    rows.some((row) => row.visibility !== "shared" || row.phase !== 1)
  )
    return;
  broadcaster.broadcastGroupNotes((viewerId) => ({
    type: "group:drag:updated",
    dragId: active.dragId,
    sequence: group.sequence,
    group: {
      ...group.frame,
      x: group.frame.x + group.delta.x,
      y: group.frame.y + group.delta.y,
    },
    notes: rows.flatMap((row) =>
      row ? [toProtocolNote(sql, row, viewerId)] : [],
    ),
    ended,
  }));
}

/** 操作権を解除して終了を配信し、再編成・成果保存・次のalarm予約へ接続する。 */
async function closeGroupDrag(
  ctx: HandlerCtx,
  active: ActiveDragOwner,
): Promise<void> {
  ctx.broadcaster.retireActiveDrag(ctx.ws);
  broadcastGroupDrag(ctx.sql, ctx.broadcaster, active, true);
  if (!ctx.broadcaster.hasActiveGroupDrag())
    autoReorganize(ctx.storage, ctx.broadcaster);
  ctx.onSharedDragEnd?.();
  await syncRoomAlarm(ctx.storage, ctx.sql);
}

export const groupDragHandlers: MessageHandlers<
  "group:drag:start" | "group:drag:move" | "group:drag:end"
> = {
  /** 表示枠・開始位置・競合を検証し、全対象の操作権と延長されない終了期限を保存する。 */
  "group:drag:start": async (ctx, message) => {
    if (expireGroupDrags(ctx.sql, ctx.storage, ctx.broadcaster)) {
      ctx.onSharedDragEnd?.();
      await syncRoomAlarm(ctx.storage, ctx.sql);
    }
    ctx.broadcaster.pruneGroupDrags();
    const current = ctx.broadcaster.activeDragFor(ctx.ws);
    if (
      current?.group &&
      current.dragId === message.dragId &&
      current.noteId === message.anchorNoteId
    ) {
      ctx.reply({
        type: "group:drag:result",
        dragId: message.dragId,
        accepted: true,
      });
      return;
    }
    const notes = listSharedNotes(ctx.sql, 1);
    const frame = calculateRenderGroups(notes, listGroups(ctx.sql)).find(
      (group) => group.representativeNoteId === message.anchorNoteId,
    );
    const targets = frame ? getGroupMoveTargets(notes, frame) : [];
    const expected = new Map(
      message.positions.map((position) => [position.noteId, position]),
    );
    // 同じIDで別接続の開始状態や終了済みの通知を上書きしない。
    const hasUsedId =
      ctx.sql
        .exec(
          "SELECT 1 FROM used_note_drag_ids WHERE drag_id = ?1 UNION ALL SELECT 1 FROM active_group_drags WHERE drag_id = ?1 LIMIT 1",
          message.dragId,
        )
        .toArray().length > 0;
    const accepted = Boolean(
      frame?.representativeNoteId &&
        !current &&
        !hasUsedId &&
        !hasReachedNoteDragStartRateLimit(ctx.sql, ctx.userId) &&
        frame.x === message.bounds.x &&
        frame.y === message.bounds.y &&
        frame.width === message.bounds.width &&
        frame.height === message.bounds.height &&
        expected.size === message.positions.length &&
        targets.length === expected.size &&
        targets.length >= 2 &&
        targets.every(
          (note) =>
            expected.get(note.id)?.x === note.x &&
            expected.get(note.id)?.y === note.y &&
            !ctx.broadcaster.findActiveDrag(note.id),
        ),
    );
    if (!accepted || !frame?.representativeNoteId) {
      ctx.reply({
        type: "group:drag:result",
        dragId: message.dragId,
        accepted: false,
      });
      return;
    }
    const attachment = ctx.ws.deserializeAttachment() as SocketAttachment;
    const representativeNoteId = frame.representativeNoteId;
    ctx.ws.serializeAttachment({
      ...attachment,
      activeDrag: {
        noteId: message.anchorNoteId,
        dragId: message.dragId,
        group: true,
      },
    } satisfies SocketAttachment);
    try {
      ctx.storage.transactionSync(() => {
        recordUsedNoteDragId(ctx.sql, ctx.userId, message.dragId);
        ctx.broadcaster.saveGroupDrag(ctx.ws, {
          frame: {
            ...frame,
            representativeNoteId,
          },
          positions: targets.map(({ id, x, y }) => ({ noteId: id, x, y })),
          sequence: 0,
          delta: { x: 0, y: 0 },
          expiresAt: Date.now() + GROUP_DRAG_MAX_DURATION_MS,
        });
      });
      await syncRoomAlarm(ctx.storage, ctx.sql);
    } catch {
      ctx.broadcaster.retireActiveDrag(ctx.ws);
      ctx.reply({
        type: "group:drag:result",
        dragId: message.dragId,
        accepted: false,
      });
      return;
    }
    ctx.reply({
      type: "group:drag:result",
      dragId: message.dragId,
      accepted: true,
    });
    const active = ctx.broadcaster.activeDragFor(ctx.ws);
    if (active) broadcastGroupDrag(ctx.sql, ctx.broadcaster, active, false);
  },
  /** 現在の操作IDと更新番号に対応する共通移動量を処理する。 */
  "group:drag:move": (ctx, message) => applyGroupMovement(ctx, message, false),
  /** 現在の操作IDに対応する最終移動量を確定し、全対象の操作権を解除する。 */
  "group:drag:end": (ctx, message) => applyGroupMovement(ctx, message, true),
};

/** 期限と更新順を検証して全座標を一括保存し、保存失敗や期限切れでは操作を終了する。 */
async function applyGroupMovement(
  ctx: HandlerCtx,
  message: {
    dragId: string;
    sequence: number;
    delta: { x: number; y: number } | null;
  },
  ended: boolean,
): Promise<void> {
  const active = ctx.broadcaster.activeDragFor(ctx.ws);
  const group = active?.group;
  if (
    !active ||
    !group ||
    active.dragId !== message.dragId ||
    message.sequence <= group.sequence
  )
    return;
  if ((group.expiresAt ?? 0) <= Date.now()) {
    await closeGroupDrag(ctx, active);
    return;
  }
  const rows = findNotes(
    ctx.sql,
    group.positions.map(({ noteId }) => noteId),
  );
  if (
    rows.length !== group.positions.length ||
    rows.some((row) => row.visibility !== "shared" || row.phase !== 1)
  ) {
    await closeGroupDrag(ctx, active);
    return;
  }
  const delta = message.delta
    ? clampGroupDelta(group.positions, message.delta)
    : group.delta;
  const nextGroup = { ...group, sequence: message.sequence, delta };
  const next: ActiveDragOwner = { ...active, group: nextGroup };
  const updatedAt = new Date().toISOString();
  try {
    ctx.storage.transactionSync(() => {
      if (message.delta) {
        ctx.sql.exec(
          `UPDATE notes
           SET x = json_extract(target.value, '$.x') + ?2,
               y = json_extract(target.value, '$.y') + ?3,
               updated_at = ?4
           FROM json_each(?1) target
           WHERE notes.id = json_extract(target.value, '$.noteId')`,
          JSON.stringify(group.positions),
          delta.x,
          delta.y,
          updatedAt,
        );
      }
      ctx.broadcaster.saveGroupDrag(ctx.ws, nextGroup);
    });
  } catch {
    await closeGroupDrag(ctx, active);
    ctx.reply({
      type: "error",
      code: "invalid-message",
      message:
        "グループの移動を保存できませんでした。もう一度動かしてください。",
    });
    return;
  }
  if (ended) await closeGroupDrag(ctx, next);
  else
    ctx.broadcaster.broadcastGroupMovement(
      {
        type: "group:drag:updated",
        dragId: next.dragId,
        sequence: nextGroup.sequence,
        group: {
          ...group.frame,
          x: group.frame.x + delta.x,
          y: group.frame.y + delta.y,
        },
        notes: group.positions.map(({ noteId, x, y }) => ({
          id: noteId,
          x: x + delta.x,
          y: y + delta.y,
          updatedAt,
        })),
        ended: false,
      },
      rows.map((row) => ({
        visibility: row.visibility,
        authorId: row.author_id,
      })),
    );
}
