// 採用と取消の認可・永続化・全員配信。現在の決定ステップでだけ選び直せる。
import { isPhaseStep, isResultStep } from "../../contracts/phase";
import { clearDecision, getDecision, setDecision } from "./decisions";
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
  "decision:clear": (ctx, message) => {
    const phase = getPhase(ctx.sql);
    if (
      !isHostUser(ctx.sql, ctx.userId) ||
      phase.kind !== "step" ||
      !isResultStep(phase)
    ) {
      replyForbidden(ctx);
      return;
    }
    const decision = getDecision(ctx.sql, phase.phase);
    if (decision && decision.noteId !== message.noteId) {
      replyForbidden(ctx);
      return;
    }
    // 同じ要求の二重送信は送信者へ未確定を返すだけ。別候補の決定は消さない。
    if (!decision) {
      ctx.reply({ type: "decision:updated", decision: null });
      return;
    }
    clearDecision(ctx.sql, phase.phase);
    ctx.broadcaster.broadcastToAll({
      type: "decision:updated",
      decision: null,
    });
  },
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
    if (changed) discardPrivateNotes(ctx.sql);
    const published = { type: "outcome:published", published: true } as const;
    if (changed) ctx.broadcaster.broadcastToAll(published);
    else ctx.reply(published);
  },
};
