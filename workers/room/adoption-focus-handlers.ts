// 採用選択中の一時フォーカス。永続化せず SocketAttachment にだけ保持し、
// RoomDO がホスト権限・現在ステップ・候補妥当性を毎回再検証する。
import { isResultStep } from "../../contracts/phase";
import { getDecision } from "./decisions";
import { type MessageHandlers, replyForbidden } from "./handler-context";
import { isHostUser } from "./members";
import { requireNoteInCurrentPhase } from "./notes";
import { getPhase } from "./phase";

export const adoptionFocusHandlers: MessageHandlers<"adoption-focus:update"> = {
  "adoption-focus:update": (ctx, message) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx);
      return;
    }

    // null は遅れて届いても安全な解除操作なので、ステップに関係なく受理する。
    if (message.noteId === null) {
      if (ctx.broadcaster.setAdoptionFocus(ctx.ws, null)) {
        ctx.broadcaster.broadcastToAll({
          type: "adoption-focus:updated",
          noteId: null,
        });
      }
      return;
    }

    const phase = getPhase(ctx.sql);
    if (
      phase.kind !== "step" ||
      !isResultStep(phase) ||
      getDecision(ctx.sql, phase.phase)
    ) {
      replyForbidden(ctx);
      return;
    }
    const note = requireNoteInCurrentPhase(ctx, message.noteId);
    if (!note) return;
    if (note.visibility !== "shared" || note.excluded) {
      replyForbidden(ctx);
      return;
    }

    ctx.broadcaster.setAdoptionFocus(ctx.ws, message.noteId);
    ctx.broadcaster.broadcastToAll({
      type: "adoption-focus:updated",
      noteId: message.noteId,
    });
  },
};
