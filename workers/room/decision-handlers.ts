// 採用確定の認可・永続化・全員配信。確定後の変更・取消は許可しない。
import { isPhaseStep } from "../../contracts/phase";
import { getDecision, setDecision } from "./decisions";
import { type MessageHandlers, replyForbidden } from "./handler-context";
import { isHostUser } from "./members";
import { requireNoteInCurrentPhase } from "./notes";
import { discardPrivateNotes, getPhase } from "./phase";

export const decisionHandlers: MessageHandlers<
  "note:decide" | "decision:clear" | "outcome:publish"
> = {
  "note:decide": (ctx, message) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }

    const note = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!note) return;
    if (note.visibility !== "shared" || note.excluded) {
      replyForbidden(ctx);
      return;
    }

    // phase はクライアントに送らせず、RoomDO の権威状態からだけ導出する。
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }

    if (ctx.broadcaster.retireAllAdoptionFocus()) {
      ctx.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
    }

    ctx.storage.transactionSync(() => {
      setDecision(
        ctx.sql,
        phase.phase,
        message.noteId,
        ctx.userId,
        note.content,
      );
      if (phase.phase === 3) discardPrivateNotes(ctx.sql);
    });
    ctx.broadcaster.retireAllActiveDrags();
    if (phase.phase === 3) ctx.refreshSnapshots();
    ctx.broadcaster.broadcastToAll({
      type: "decision:updated",
      decision: {
        phase: phase.phase,
        noteId: message.noteId,
        decidedBy: ctx.userId,
      },
    });
  },
  // 旧クライアントの取消要求も、決定を変更せず明示的に拒否する。
  "decision:clear": (ctx) => replyForbidden(ctx),
  "outcome:publish": (ctx) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }
    const phase = getPhase(ctx.sql);
    if (!isPhaseStep(phase, 3, 5) || !getDecision(ctx.sql, 3)) {
      replyForbidden(ctx);
      return;
    }
    const changed =
      ctx.sql
        .exec(
          "UPDATE room_state SET outcome_published = 1 WHERE id = 1 AND outcome_published = 0 RETURNING id",
        )
        .toArray().length > 0;
    const published = { type: "outcome:published", published: true } as const;
    if (changed) ctx.broadcaster.broadcastToAll(published);
    else ctx.reply(published);
  },
};
