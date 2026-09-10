// note:* メッセージのハンドラ。各ハンドラは
// 「認可（author / 可視性）→ 保存 → 配信 → 必要なら自動再編成」の順で閉じる。
import {
  NOTE_SPAWN_JITTER,
  NOTE_SPAWN_X_MIN,
  NOTE_SPAWN_Y_MIN,
} from "../../contracts/board";
import { isPhaseStep } from "../../contracts/phase";
import type { SocketAttachment } from "./broadcast";
import { autoReorganize } from "./groups";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
} from "./handler-context";
import { findMember, getMemberColor } from "./members";
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
  toProtocolNote,
  touchNote,
  unpublishNote,
  updateNoteContent,
} from "./notes";
import { getPhase, isPersonalWritingStep } from "./phase";
import {
  addUserNoteVote,
  countUserNoteVotes,
  deleteNoteVotes,
  hasReachedVoteLimit,
  removeUserNoteVotes,
} from "./votes";

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
  | "note:drag"
  | "note:delete"
  | "note:vote"
  | "note:vote-reset"
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
      created_at: now,
      updated_at: now,
      phase: phase.phase,
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
    publishNote(ctx.sql, message.noteId, message.x, message.y, updatedAt);
    broadcastNoteInserted(ctx.sql, ctx.broadcaster, {
      ...row,
      visibility: "shared",
      x: message.x,
      y: message.y,
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
    if (!canEdit(row, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    moveNote(ctx.sql, message.noteId, message.x, message.y, updatedAt);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      x: message.x,
      y: message.y,
      updated_at: updatedAt,
    });
    const attachment =
      ctx.ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.activeDragNoteId === message.noteId) {
      ctx.ws.serializeAttachment({
        ...attachment,
        activeDragNoteId: undefined,
      } satisfies SocketAttachment);
    }

    // 位置が変わったので自動再編成を実行
    autoReorganizeAtGroupingStep(ctx);
  },

  // ドラッグ中の座標は永続化せず、送信者以外の可視な相手へ中継するだけ。
  "note:drag": (ctx, message) => {
    const row = findNote(ctx.sql, message.noteId);
    if (!row) {
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step" || row.phase !== phase.phase) {
      replyForbidden(ctx);
      return;
    }
    if (!canEdit(row, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    if (row.visibility === "private") {
      return;
    }
    const draggedBy = findMember(ctx.sql, ctx.userId);
    if (!draggedBy) return;
    const attachment =
      (ctx.ws.deserializeAttachment() as SocketAttachment | null) ?? {
        userId: ctx.userId,
      };
    ctx.ws.serializeAttachment({
      ...attachment,
      activeDragNoteId: message.noteId,
    } satisfies SocketAttachment);
    ctx.broadcaster.broadcast(
      {
        type: "note:drag",
        noteId: message.noteId,
        x: message.x,
        y: message.y,
        draggedBy,
      },
      toProtocolNote(ctx.sql, row, ctx.userId),
      ctx.ws,
    );
  },

  "note:delete": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      row.author_id !== ctx.userId ||
      isFrozenSharedNoteAtPersonalStep(ctx, row)
    ) {
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
    if (!isVisibleTo(row, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }

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
    );
  },

  "note:vote-reset": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (!isVisibleTo(row, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }

    removeUserNoteVotes(ctx.sql, message.noteId, ctx.userId, message.kind);

    const updatedAt = new Date().toISOString();
    touchNote(ctx.sql, message.noteId, updatedAt);
    broadcastVoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      { ...row, updated_at: updatedAt },
      ctx.userId,
    );
  },
};
