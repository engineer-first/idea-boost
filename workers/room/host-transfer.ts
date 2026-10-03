import { isRoomClosed } from "./completed-rooms";
import type { MessageHandlers } from "./handler-context";
import { getHostState, isMember } from "./members";
import { getPendingPhaseTransition } from "./phase";

// 認可・対象・改訂確認と更新の間にawaitを置かない。進行状態には触れない。
export const hostHandlers: MessageHandlers<"host:transfer"> = {
  "host:transfer": (ctx, message) => {
    const accepted = ctx.storage.transactionSync(() => {
      const host = getHostState(ctx.sql);
      if (
        host.hostUserId !== ctx.userId ||
        host.hostRevision !== message.expectedHostRevision ||
        isRoomClosed(ctx.sql) ||
        getPendingPhaseTransition(ctx.sql) !== null ||
        message.targetUserId === ctx.userId ||
        !isMember(ctx.sql, message.targetUserId) ||
        !ctx.broadcaster.isConnected(message.targetUserId)
      )
        return false;
      ctx.sql.exec(
        "UPDATE room_owner SET host_id=?1, host_revision=host_revision+1 WHERE id=1",
        message.targetUserId,
      );
      return true;
    });
    if (!accepted) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message:
          "引き継げませんでした。進行処理が終わってから、接続中の別メンバーを選び直してください。",
      });
      return;
    }
    ctx.broadcaster.broadcastToAll({
      type: "host:updated",
      hostUserId: message.targetUserId,
      hostRevision: getHostState(ctx.sql).hostRevision,
      ...(message.operationId ? { operationId: message.operationId } : {}),
    });
    if (ctx.broadcaster.retireAllAdoptionFocus())
      ctx.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
  },
};
