// note:* メッセージのハンドラ。各ハンドラは
// 「認可（author / 可視性）→ 保存 → 配信 → 必要なら自動再編成」の順で閉じる。
import {
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_SPAWN_JITTER,
  NOTE_SPAWN_X_MIN,
  NOTE_SPAWN_Y_MIN,
} from "../../contracts/board";
import { isPhaseStep, isVotingStep } from "../../contracts/phase";
import type { SocketAttachment } from "./broadcast";
import { getDecision } from "./decisions";
import {
  hasReachedNoteDragStartRateLimit,
  hasUsedNoteDragId,
  recordUsedNoteDragId,
} from "./drag-operations";
import { autoReorganize } from "./groups";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
} from "./handler-context";
import { broadcastIdeaMapState, isIdeaMapVisiblePhase } from "./idea-map";
import { getMemberColor, isHostUser } from "./members";
import {
  bringNoteToFront,
  broadcastNoteInserted,
  broadcastNoteUpdated,
  broadcastVoteUpdated,
  canEdit,
  deleteNote,
  excludeNotesForBulkOperation,
  findNote,
  insertNote,
  isVisibleTo,
  listBulkExclusionCandidates,
  listBulkRestoreTargets,
  moveNote,
  type NoteRow,
  publishNote,
  requireNoteInCurrentPhase,
  restoreNotesForBulkOperation,
  setNoteExcluded,
  toProtocolNote,
  touchNote,
  unpublishNote,
  updateNoteFontSize,
} from "./notes";
import { getPhase, getPhaseRevision, isPersonalWritingStep } from "./phase";
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

async function contentDigest(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const noteHandlers: MessageHandlers<
  | "note:create"
  | "note:publish"
  | "note:unpublish"
  | "note:update-content"
  | "note:content-status"
  | "note:update-font-size"
  | "note:move"
  | "note:bring-to-front"
  | "note:drag:start"
  | "note:drag:move"
  | "note:drag:end"
  | "note:exclude"
  | "note:restore"
  | "note:bulk-exclude"
  | "note:bulk-restore"
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
      font_size: NOTE_DEFAULT_FONT_SIZE,
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
    const phase = getPhase(ctx.sql);
    // 3-2 ではドックへ戻す pointerup/cancel まで匿名 map lock を維持する。
    // 他フェーズでは従来どおり unpublish と同時にドラッグを終了する。
    if (owner?.socket === ctx.ws && !isIdeaMapVisiblePhase(phase)) {
      ctx.broadcaster.retireActiveDrag(ctx.ws);
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

  "note:update-content": async (ctx, message) => {
    // WebCrypto は非同期なので、権限とフェーズの検査は計算が終わった後に行う。
    const digest = await contentDigest(message.content);
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
    const prior = ctx.sql
      .exec(
        "SELECT user_id, note_id, content_digest, expected_content_revision, expected_phase_revision, content_revision FROM note_content_receipts WHERE operation_id = ?1",
        message.operationId,
      )
      .toArray()[0] as
      | {
          user_id: string;
          note_id: string;
          content_digest: string;
          expected_content_revision: number;
          expected_phase_revision: number;
          content_revision: number;
        }
      | undefined;
    if (prior) {
      if (
        prior.user_id === ctx.userId &&
        prior.note_id === message.noteId &&
        prior.content_digest === digest &&
        prior.expected_content_revision === message.expectedContentRevision &&
        prior.expected_phase_revision === message.expectedPhaseRevision
      ) {
        ctx.reply({
          type: "note:content-saved",
          operationId: message.operationId,
          noteId: message.noteId,
          contentRevision: prior.content_revision,
        });
      } else {
        ctx.reply({
          type: "error",
          code: "content-conflict",
          message: "同じ保存IDで別の本文を保存できません。",
        });
      }
      return;
    }
    if (
      getPhaseRevision(ctx.sql) !== message.expectedPhaseRevision ||
      (row.content_revision ?? 0) !== message.expectedContentRevision
    ) {
      ctx.reply({
        type: "error",
        code: "content-conflict",
        message: "付箋の本文が先に更新されました。",
      });
      return;
    }
    const updatedAt = new Date().toISOString();
    const contentRevision = message.expectedContentRevision + 1;
    ctx.storage.transactionSync(() => {
      ctx.sql.exec(
        "UPDATE notes SET content = ?2, updated_at = ?3 WHERE id = ?1",
        message.noteId,
        message.content,
        updatedAt,
      );
      ctx.sql.exec(
        "INSERT INTO note_content_versions (note_id, content_revision) VALUES (?1, ?2) ON CONFLICT(note_id) DO UPDATE SET content_revision = excluded.content_revision WHERE note_content_versions.content_revision = ?3",
        message.noteId,
        contentRevision,
        message.expectedContentRevision,
      );
      if (Number(ctx.sql.exec("SELECT changes() AS count").one().count) !== 1)
        throw new Error("本文のrevisionが競合しました。");
      ctx.sql.exec(
        "INSERT INTO note_content_receipts (operation_id, user_id, note_id, content_digest, expected_content_revision, expected_phase_revision, content_revision, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        message.operationId,
        ctx.userId,
        message.noteId,
        digest,
        message.expectedContentRevision,
        message.expectedPhaseRevision,
        contentRevision,
        updatedAt,
      );
    });
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      content: message.content,
      content_revision: contentRevision,
      updated_at: updatedAt,
    });
    ctx.reply({
      type: "note:content-saved",
      operationId: message.operationId,
      noteId: message.noteId,
      contentRevision,
    });
  },
  "note:content-status": (ctx, message) => {
    const receipt = ctx.sql
      .exec(
        "SELECT note_id, content_revision FROM note_content_receipts WHERE operation_id = ?1 AND user_id = ?2",
        message.operationId,
        ctx.userId,
      )
      .toArray()[0] as
      | { note_id: string; content_revision: number }
      | undefined;
    ctx.reply(
      receipt
        ? {
            type: "note:content-status-result",
            operationId: message.operationId,
            status: "accepted",
            noteId: receipt.note_id,
            contentRevision: receipt.content_revision,
          }
        : {
            type: "note:content-status-result",
            operationId: message.operationId,
            status: "unknown",
          },
    );
  },

  "note:update-font-size": (ctx, message) => {
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
    updateNoteFontSize(ctx.sql, message.noteId, message.fontSize, updatedAt);
    broadcastNoteUpdated(
      ctx.sql,
      ctx.broadcaster,
      {
        ...row,
        font_size: message.fontSize,
        updated_at: updatedAt,
      },
      message.operationId,
    );
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

  "note:bring-to-front": (ctx, message) => {
    const row = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!row) return;
    if (
      row.visibility !== "shared" ||
      row.excluded ||
      !canEdit(row, ctx.userId) ||
      ctx.broadcaster.findActiveDrag(message.noteId)
    ) {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    const stackOrder = bringNoteToFront(ctx.sql, message.noteId, updatedAt);
    broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
      ...row,
      stack_order: stackOrder,
      updated_at: updatedAt,
    });
  },

  "note:drag:start": (ctx, message) => {
    const row = findNote(ctx.sql, message.noteId);
    const phase = getPhase(ctx.sql);
    const current = ctx.broadcaster.activeDragFor(ctx.ws);
    const competing = ctx.broadcaster.findActiveDrag(message.noteId);
    const isActiveRetry = Boolean(
      current?.noteId === message.noteId && current.dragId === message.dragId,
    );
    const isPrivateIdeaMapDrag = Boolean(
      row?.visibility === "private" &&
        phase.kind === "step" &&
        phase.phase === 3 &&
        phase.step === 2 &&
        row.phase === 3 &&
        row.author_id === ctx.userId,
    );
    const accepted = Boolean(
      row &&
        (row.visibility === "shared" || isPrivateIdeaMapDrag) &&
        phase.kind === "step" &&
        row.phase === phase.phase &&
        canEdit(row, ctx.userId) &&
        !row.excluded &&
        (isActiveRetry ||
          (!current &&
            !hasUsedNoteDragId(ctx.sql, ctx.userId, message.dragId) &&
            !hasReachedNoteDragStartRateLimit(ctx.sql, ctx.userId))) &&
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
    if (accepted && isIdeaMapVisiblePhase(phase)) {
      broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
    }
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
    const phase = getPhase(ctx.sql);
    if (
      row?.visibility === "private" &&
      isPhaseStep(phase, 3, 2) &&
      row.phase === 3 &&
      row.author_id === ctx.userId
    ) {
      // private drag start は内容を共有せず lock だけを保持する。
      return;
    }
    if (
      row?.visibility !== "shared" ||
      row.excluded ||
      !canEdit(row, ctx.userId)
    ) {
      ctx.broadcaster.retireActiveDrag(ctx.ws);
      if (isIdeaMapVisiblePhase(phase)) {
        broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
      }
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
    const phase = getPhase(ctx.sql);
    ctx.broadcaster.retireActiveDrag(ctx.ws);
    if (
      row?.visibility === "private" &&
      isPhaseStep(phase, 3, 2) &&
      row.phase === 3 &&
      row.author_id === ctx.userId
    ) {
      broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
      return;
    }
    if (
      row?.visibility !== "shared" ||
      row.excluded ||
      !canEdit(row, ctx.userId)
    ) {
      if (isIdeaMapVisiblePhase(phase)) {
        broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
      }
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
    if (isIdeaMapVisiblePhase(phase)) {
      broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
    }
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
    if (ctx.broadcaster.retireAdoptionFocusForNote(row.id)) {
      ctx.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
    }
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

  "note:bulk-exclude": (ctx) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }
    const operationId = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    let targets: NoteRow[] = [];
    ctx.storage.transactionSync(() => {
      targets = listBulkExclusionCandidates(ctx.sql, phase.phase);
      excludeNotesForBulkOperation(
        ctx.sql,
        targets.map(({ id }) => id),
        operationId,
        updatedAt,
      );
    });
    if (
      targets.some(({ id }) => ctx.broadcaster.retireAdoptionFocusForNote(id))
    ) {
      ctx.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
    }
    for (const row of targets) {
      broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
        ...row,
        excluded: true,
        updated_at: updatedAt,
      });
    }
    ctx.reply({
      type: "note:bulk-excluded",
      operationId,
      count: targets.length,
      source: "manual",
    });
  },

  "note:bulk-restore": (ctx, message) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }
    const updatedAt = new Date().toISOString();
    let targets: NoteRow[] = [];
    ctx.storage.transactionSync(() => {
      targets = listBulkRestoreTargets(
        ctx.sql,
        phase.phase,
        message.operationId,
      );
      restoreNotesForBulkOperation(
        ctx.sql,
        targets.map(({ id }) => id),
        updatedAt,
      );
    });
    for (const row of targets) {
      broadcastNoteUpdated(ctx.sql, ctx.broadcaster, {
        ...row,
        excluded: false,
        updated_at: updatedAt,
      });
    }
    ctx.reply({
      type: "note:bulk-restored",
      operationId: message.operationId,
      count: targets.length,
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
    if (
      row.visibility !== "shared" ||
      !isVisibleTo(row, ctx.userId) ||
      row.excluded
    ) {
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
    if (
      row.visibility !== "shared" ||
      !isVisibleTo(row, ctx.userId) ||
      row.excluded
    ) {
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
    if (
      row.visibility !== "shared" ||
      !isVisibleTo(row, ctx.userId) ||
      row.excluded
    ) {
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
    if (
      row.visibility !== "shared" ||
      !isVisibleTo(row, ctx.userId) ||
      row.excluded
    ) {
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
      target.visibility !== "shared" ||
      source.visibility !== "shared" ||
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
    if (
      row?.visibility !== "shared" ||
      !isVisibleTo(row, ctx.userId) ||
      row.excluded
    ) {
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
