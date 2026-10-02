import {
  calculateRenderGroups,
  clampGroupDelta,
  getGroupMoveTargets,
} from "../../contracts/grouping";
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
import { findNote, listSharedNotes, toProtocolNote } from "./notes";

export function broadcastGroupDrag(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  active: ActiveDragOwner,
  ended: boolean,
): void {
  const group = active.group;
  if (!group) return;
  const rows = group.positions.map(({ noteId }) => findNote(sql, noteId));
  if (rows.some((row) => row?.visibility !== "shared" || row.phase !== 1))
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

function closeGroupDrag(ctx: HandlerCtx, active: ActiveDragOwner): void {
  ctx.broadcaster.retireActiveDrag(ctx.ws);
  broadcastGroupDrag(ctx.sql, ctx.broadcaster, active, true);
  if (!ctx.broadcaster.hasActiveGroupDrag())
    autoReorganize(ctx.storage, ctx.broadcaster);
  ctx.onSharedDragEnd?.();
}

export const groupDragHandlers: MessageHandlers<
  "group:drag:start" | "group:drag:move" | "group:drag:end"
> = {
  "group:drag:start": (ctx, message) => {
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
        });
      });
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
  "group:drag:move": (ctx, message) => applyGroupMovement(ctx, message, false),
  "group:drag:end": (ctx, message) => applyGroupMovement(ctx, message, true),
};

function applyGroupMovement(
  ctx: HandlerCtx,
  message: {
    dragId: string;
    sequence: number;
    delta: { x: number; y: number } | null;
  },
  ended: boolean,
): void {
  const active = ctx.broadcaster.activeDragFor(ctx.ws);
  const group = active?.group;
  if (
    !active ||
    !group ||
    active.dragId !== message.dragId ||
    message.sequence <= group.sequence
  )
    return;
  const rows = group.positions.map(({ noteId }) => findNote(ctx.sql, noteId));
  if (rows.some((row) => row?.visibility !== "shared" || row.phase !== 1)) {
    closeGroupDrag(ctx, active);
    return;
  }
  const delta = message.delta
    ? clampGroupDelta(group.positions, message.delta)
    : group.delta;
  const nextGroup = { ...group, sequence: message.sequence, delta };
  const next: ActiveDragOwner = { ...active, group: nextGroup };
  try {
    ctx.storage.transactionSync(() => {
      if (message.delta) {
        const updatedAt = new Date().toISOString();
        for (const position of group.positions)
          ctx.sql.exec(
            "UPDATE notes SET x = ?2, y = ?3, updated_at = ?4 WHERE id = ?1",
            position.noteId,
            position.x + delta.x,
            position.y + delta.y,
            updatedAt,
          );
      }
      ctx.broadcaster.saveGroupDrag(ctx.ws, nextGroup);
    });
  } catch {
    closeGroupDrag(ctx, active);
    ctx.reply({
      type: "error",
      code: "invalid-message",
      message:
        "グループの移動を保存できませんでした。もう一度動かしてください。",
    });
    return;
  }
  if (ended) closeGroupDrag(ctx, next);
  else broadcastGroupDrag(ctx.sql, ctx.broadcaster, next, false);
}
