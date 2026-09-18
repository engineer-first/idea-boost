// 決定と解除の認可・永続化・全員配信。決定はフェーズ番号をキーにした共有情報。
import { clearDecision, setDecision } from "./decisions";
import { type MessageHandlers, replyForbidden } from "./handler-context";
import { isHostUser } from "./members";
import { requireNoteInCurrentPhase } from "./notes";
import { getPhase } from "./phase";

export const decisionHandlers: MessageHandlers<
  "note:decide" | "decision:clear"
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

    setDecision(ctx.sql, phase.phase, message.noteId, ctx.userId, note.content);
    ctx.broadcaster.broadcastToAll({
      type: "decision:updated",
      decision: {
        phase: phase.phase,
        noteId: message.noteId,
        decidedBy: ctx.userId,
      },
    });
  },
  "decision:clear": (ctx) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }

    // phase はクライアントに指定させず、RoomDO の現在状態だけから
    // 求める。操作可能なステップは phase の共通ゲートが制限する。
    const phase = getPhase(ctx.sql);
    if (phase.kind !== "step") {
      replyForbidden(ctx);
      return;
    }

    clearDecision(ctx.sql, phase.phase);
    ctx.broadcaster.broadcastToAll({
      type: "decision:updated",
      decision: null,
    });
  },
};
