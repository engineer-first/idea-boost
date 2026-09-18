// note:* メッセージのハンドラ。各ハンドラは
// 「認可（author / 可視性）→ 保存 → 配信 → 必要なら自動再編成」の順で閉じる。
import {
  NOTE_SPAWN_JITTER,
  NOTE_SPAWN_X_MIN,
  NOTE_SPAWN_Y_MIN,
} from "../../contracts/board";
import { isPhaseStep, isVotingStep } from "../../contracts/phase";
import type { SocketAttachment } from "./broadcast";
import { getDecision } from "./decisions";
import { hasUsedNoteDragId, recordUsedNoteDragId } from "./drag-operations";
import { autoReorganize } from "./groups";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
} from "./handler-context";
import { getMemberColor, isHostUser } from "./members";
import {
  broadcastNoteInserted,
  broadcastNoteUpdated,
  broadcastVoteUpdated,
  canEdit,
  deleteNote,
  findNote,
  insertNote,
  isVisibleTo,
  moveNote,
  type NoteRow,
  publishNote,
  requireNoteInCurrentPhase,
  setNoteExcluded,
  toProtocolNote,
  touchNote,
  unpublishNote,
  updateNoteContent,
} from "./notes";
import { getPhase, isPersonalWritingStep } from "./phase";
import {
  addUserNoteVote,
  addVoteSticker,
  countUserNoteVotes,
  deleteNoteVotes,
  findVoteSticker,
  hasCompletedVoting,
  hasReachedVoteLimit,
  moveVoteSticker,
  removeOneUserNoteVote,
  removeUserNoteVotes,
  removeVoteSticker,
} from "./votes";

function broadcastVotingStatusIfChanged(
  ctx: HandlerCtx,
  wasComplete: boolean,
): void {
  const phase = getPhase(ctx.sql);
  if (phase.kind !== "step" || !isVotingStep(phase)) return;
  const isComplete = hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);
  if (isComplete === wasComplete) return;
  ctx.broadcaster.broadcastToAll({
    type: "member_vote_status",
    userId: ctx.userId,
    isComplete,
  });
}

function autoReorganizeAtGroupingStep(ctx: HandlerCtx): void {
  if (isPhaseStep(getPhase(ctx.sql), 1, 3)) {
    autoReorganize(ctx.storage, ctx.broadcaster);
  }
}

// 個人執筆ステップでは自分の private 付箋だけが変更対象。前フェーズから
// 残っている共有付箋は記録として凍結する（canEdit の「shared は全員編集可」
// が個人執筆ステップへ漏れ込むのを塞ぐ）。
function isFrozenSharedNoteAtPersonalStep(
  ctx: HandlerCtx,
  row: NoteRow,
): boolean {
  return (
    row.visibility !== "private" && isPersonalWritingStep(getPhase(ctx.sql))
  );
}

export const noteHandlers: MessageHandlers<
  | "note:create"
  | "note:publish"
  | "note:unpublish"
  | "note:update-content"
  | "note:move"
  | "note:drag:start"
  | "note:drag:move"
  | "note:drag:end"
  | "note:exclude"
  | "note:restore"
  | "note:delete"
  | "note:vote"
  | "note:vote-reset"
  | "note:vote-remove"
  | "note:vote-sticker:add"
  | "note:vote-sticker:move"
  | "note:vote-sticker:remove"
> = {
  "note:create": (ctx, message) => {
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }
    const now = new Date().toISOString();
    const color = getMemberColor(ctx.sql, ctx.userId) ?? "yellow";

    const note: NoteRow = {
      id: crypto.randomUUID(),
      author_id: ctx.userId,
      content: message.content ?? "",
      visibility: "private",
      color: color,
      x: NOTE_SPAWN_X_MIN + Math.random() * NOTE_SPAWN_JITTER,
      y: NOTE_SPAWN_Y_MIN + Math.random() * NOTE_SPAWN_JITTER,
      stack_order: 0,
      created_at: now,
      updated_at: now,
      phase: phase.phase,
      excluded: false,
    };
    insertNote(ctx.sql, note);
    broadcastNoteInserted(ctx.sql, ctx.broadcaster, note);
  },

  "note:publish": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (row.author_id !== ctx.userId || row.visibility !== "private") {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    const stackOrder = publishNote(
      ctx.sql,
      message.noteId,
      message.x,
      message.y,
      updatedAt,
    );
    broadcastNoteInserted(ctx.sql, ctx.broadcaster, {
      ...row,
      visibility: "shared",
      x: message.x,
      y: message.y,
      stack_order: stackOrder,
      updated_at: updatedAt,
    });
    autoReorganizeAtGroupingStep(ctx);
  },

  "note:unpublish": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (row.author_id !== ctx.userId || row.visibility !== "shared") {
      replyForbidden(ctx);
      return;
    }
    const owner = ctx.broadcaster.findActiveDrag(message.noteId);
    if (owner && owner.socket !== ctx.ws) {
      replyForbidden(ctx);
      return;
    }
    if (owner?.socket === ctx.ws) ctx.broadcaster.retireActiveDrag(ctx.ws);
    // shared の行を消す通知は、可視性を変える前に全メンバーへ送る。
    ctx.broadcaster.broadcast(
      { type: "note:deleted", noteId: message.noteId },
      toProtocolNote(ctx.sql, row, ctx.userId),
    );
    const updatedAt = new Date().toISOString();
    unpublishNote(ctx.sql, message.noteId, updatedAt);
    // private 化後は作者だけに同じIDの付箋を復帰させる。
    broadcastNoteInserted(ctx.sql, ctx.broadcaster, {
      ...row,
      visibility: "private",
      updated_at: updatedAt,
    });
    autoReorganizeAtGroupingStep(ctx);
  },

  "note:update-content": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      !canEdit(row, ctx.userId) ||
      row.excluded ||
      isFrozenSharedNoteAtPersonalStep(ctx, row)
    ) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    updateNoteContent(ctx.sql, message.noteId, message.content, updatedAt);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      content: message.content,
      updated_at: updatedAt,
    });
  },

  "note:move": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!canEdit(row, ctx.userId) || row.excluded) {
      replyForbidden(ctx);
      return;
    }
    const owner = ctx.broadcaster.findActiveDrag(message.noteId);
    if (owner) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    const positionChanged = row.x !== message.x || row.y !== message.y;
    const stackOrder = moveNote(
      ctx.sql,
      message.noteId,
      message.x,
      message.y,
      updatedAt,
    );
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      x: message.x,
      y: message.y,
      stack_order: stackOrder,
      updated_at: updatedAt,
    });
    if (positionChanged) {
      autoReorganizeAtGroupingStep(ctx);
    }
  },

  "note:drag:start": (ctx, message) => {
    const row = findNote(ctx.sql, message.noteId);
    const phase = getPhase(ctx.sql);
    const current = ctx.broadcaster.activeDragFor(ctx.ws);
    const competing = ctx.broadcaster.findActiveDrag(message.noteId);
    const isActiveRetry = Boolean(
      current?.noteId === message.noteId && current.dragId === message.dragId,
    );
    const accepted = Boolean(
      row &&
        row.visibility === "shared" &&
        phase.kind === "step" &&
        row.phase === phase.phase &&
        canEdit(row, ctx.userId) &&
        !row.excluded &&
        (isActiveRetry ||
          (!current &&
            !hasUsedNoteDragId(ctx.sql, ctx.userId, message.dragId))) &&
        (!competing ||
          (competing.socket === ctx.ws && competing.dragId === message.dragId)),
    );
    if (accepted) {
      recordUsedNoteDragId(ctx.sql, ctx.userId, message.dragId);
      const attachment =
        (ctx.ws.deserializeAttachment() as SocketAttachment | null) ?? {
          userId: ctx.userId,
        };
      ctx.ws.serializeAttachment({
        ...attachment,
        activeDrag: { noteId: message.noteId, dragId: message.dragId },
      } satisfies SocketAttachment);
    }
    ctx.reply({
      type: "note:drag:result",
      dragId: message.dragId,
      accepted,
    });
  },

  "note:drag:move": (ctx, message) => {
    const active = ctx.broadcaster.activeDragFor(ctx.ws);
    if (
      !active ||
      active.noteId !== message.noteId ||
      active.dragId !== message.dragId
    ) {
      return;
    }
    const row = findNote(ctx.sql, message.noteId);
    if (
      row?.visibility !== "shared" ||
      row.excluded ||
      !canEdit(row, ctx.userId)
    ) {
      ctx.broadcaster.retireActiveDrag(ctx.ws);
      return;
    }
    const updatedAt = new Date().toISOString();
    const stackOrder = moveNote(
      ctx.sql,
      message.noteId,
      message.x,
      message.y,
      updatedAt,
    );
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      x: message.x,
      y: message.y,
      stack_order: stackOrder,
      updated_at: updatedAt,
    });
  },

  "note:drag:end": (ctx, message) => {
    const active = ctx.broadcaster.activeDragFor(ctx.ws);
    if (
      !active ||
      active.noteId !== message.noteId ||
      active.dragId !== message.dragId
    ) {
      return;
    }
    const row = findNote(ctx.sql, message.noteId);
    ctx.broadcaster.retireActiveDrag(ctx.ws);
    if (
      row?.visibility !== "shared" ||
      row.excluded ||
      !canEdit(row, ctx.userId)
    ) {
      return;
    }
    const updatedAt = new Date().toISOString();
    let stackOrder = row.stack_order;
    if (message.position) {
      stackOrder = moveNote(
        ctx.sql,
        message.noteId,
        message.position.x,
        message.position.y,
        updatedAt,
      );
    }
    const current = message.position
      ? {
          ...row,
          x: message.position.x,
          y: message.position.y,
          stack_order: stackOrder,
          updated_at: updatedAt,
        }
      : (findNote(ctx.sql, message.noteId) ?? row);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, current);
    autoReorganizeAtGroupingStep(ctx);
  },

  "note:exclude": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      !isHostUser(ctx.sql, ctx.userId) ||
      row.visibility !== "shared" ||
      row.excluded ||
      getDecision(ctx.sql, row.phase)?.noteId === row.id
    ) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    setNoteExcluded(ctx.sql, row.id, true, updatedAt);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      excluded: true,
      updated_at: updatedAt,
    });
  },

  "note:restore": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      !isHostUser(ctx.sql, ctx.userId) ||
      row.visibility !== "shared" ||
      !row.excluded
    ) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    setNoteExcluded(ctx.sql, row.id, false, updatedAt);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      excluded: false,
      updated_at: updatedAt,
    });
  },

  "note:delete": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      row.author_id !== ctx.userId ||
      row.excluded ||
      isFrozenSharedNoteAtPersonalStep(ctx, row)
    ) {
      replyForbidden(ctx);
      return;
    }
    if (ctx.broadcaster.findActiveDrag(message.noteId)) {
      replyForbidden(ctx);
      return;
    }
    deleteNote(ctx.sql, message.noteId);
    deleteNoteVotes(ctx.sql, message.noteId);
    ctx.broadcaster.broadcast(
      { type: "note:deleted", noteId: message.noteId },
      toProtocolNote(ctx.sql, row, ctx.userId),
    );

    // 付箋が削除されたので自動再編成を実行
    autoReorganizeAtGroupingStep(ctx);
  },

  "note:vote": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!isVisibleTo(row, ctx.userId) || row.excluded) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }
    const wasComplete = hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);

    const ownCount = countUserNoteVotes(
      ctx.sql,
      message.noteId,
      ctx.userId,
      message.kind,
    );
    // 主観投票は同じ付箋への再投票でトグル解除になる。
    if (message.kind === "subjective" && ownCount > 0) {
      removeUserNoteVotes(ctx.sql, message.noteId, ctx.userId, message.kind);
    } else {
      if (hasReachedVoteLimit(ctx.sql, ctx.userId, message.kind, phase.phase)) {
        ctx.reply({
          type: "error",
          code: "forbidden",
          message: "投票上限を超えています。",
        });
        return;
      }
      addUserNoteVote(ctx.sql, message.noteId, ctx.userId, message.kind);
    }

    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, message.noteId, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
    broadcastVotingStatusIfChanged(ctx, wasComplete);
  },

  "note:vote-reset": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!isVisibleTo(row, ctx.userId) || row.excluded) {
      replyForbidden(ctx);
      return;
    }

    const phase = getPhase(ctx.sql);
    const wasComplete =
      phase.kind === "step" &&
      hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);

    removeUserNoteVotes(ctx.sql, message.noteId, ctx.userId, message.kind);

    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, message.noteId, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
    broadcastVotingStatusIfChanged(ctx, wasComplete);
  },

  "note:vote-remove": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!isVisibleTo(row, ctx.userId) || row.excluded) {
      replyForbidden(ctx);
      return;
    }

    const phase = getPhase(ctx.sql);
    const wasComplete =
      phase.kind === "step" &&
      hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);

    if (
      !removeOneUserNoteVote(ctx.sql, message.noteId, ctx.userId, message.kind)
    ) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "取り消せる投票がありません。",
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, message.noteId, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
    broadcastVotingStatusIfChanged(ctx, wasComplete);
  },

  "note:vote-sticker:add": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!isVisibleTo(row, ctx.userId) || row.excluded) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }
    const wasComplete = hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);
    const existing = findVoteSticker(ctx.sql, message.stickerId);
    if (existing) {
      const isSameSticker =
        existing.note_id === message.noteId &&
        existing.user_id === ctx.userId &&
        existing.kind === message.kind &&
        existing.x === message.x &&
        existing.y === message.y;
      if (isSameSticker) {
        broadcastVoteUpdated(
          ctx.sql,
          ctx.broadcaster,
          row,
          ctx.userId,
          message.operationId,
        );
        return;
      }
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "同じシールは重ねて貼れません。",
      });
      return;
    }
    if (hasReachedVoteLimit(ctx.sql, ctx.userId, message.kind, phase.phase)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "投票上限を超えています。",
      });
      return;
    }
    if (
      !addVoteSticker(
        ctx.sql,
        {
          id: message.stickerId,
          kind: message.kind,
          x: message.x,
          y: message.y,
        },
        message.noteId,
        ctx.userId,
      )
    ) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "同じシールは重ねて貼れません。",
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, message.noteId, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
    broadcastVotingStatusIfChanged(ctx, wasComplete);
  },

  "note:vote-sticker:move": (ctx, message) => {
    const sticker = findVoteSticker(ctx.sql, message.stickerId);
    if (!sticker || sticker.user_id !== ctx.userId) {
      replyForbidden(ctx);
      return;
    }
    const source = requireNoteInCurrentPhase(ctx, sticker.note_id);
    if (!source) return;
    const target = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!target) return;
    if (
      !isVisibleTo(target, ctx.userId) ||
      target.excluded ||
      source.excluded
    ) {
      replyForbidden(ctx);
      return;
    }

    const updatedAt = new Date().toISOString();
    ctx.storage.transactionSync(() => {
      moveVoteSticker(
        ctx.sql,
        message.stickerId,
        message.noteId,
        message.x,
        message.y,
      );
      touchNote(ctx.sql, source.id, updatedAt);
      if (target.id !== source.id) touchNote(ctx.sql, target.id, updatedAt);
    });
    if (source.id !== target.id) {
      broadcastVoteUpdated(
        ctx.sql,
        ctx.broadcaster,
        { ...source, updated_at: updatedAt },
        ctx.userId,
      );
    }
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...target, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
  },

  "note:vote-sticker:remove": (ctx, message) => {
    const sticker = findVoteSticker(ctx.sql, message.stickerId);
    if (!sticker || sticker.user_id !== ctx.userId) {
      replyForbidden(ctx);
      return;
    }
    const row = requireNoteInCurrentPhase(ctx, sticker.note_id);
    if (!row || !isVisibleTo(row, ctx.userId) || row.excluded) {
      if (row) replyForbidden(ctx);
      return;
    }

    const phase = getPhase(ctx.sql);
    const wasComplete =
      phase.kind === "step" &&
      hasCompletedVoting(ctx.sql, ctx.userId, phase.phase);

    removeVoteSticker(ctx.sql, message.stickerId);
    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, row.id, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
      message.operationId,
    );
    broadcastVotingStatusIfChanged(ctx, wasComplete);
  },
};
