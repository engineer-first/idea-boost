import type { MessageHandlers } from "./handler-context";
import { getHostState, isMember } from "./members";
import { getPhase } from "./phase";

// 開始前だけの一操作。認可/対象/改訂確認と更新の間にawaitを置かない。
export const hostHandlers: MessageHandlers<"host:transfer"> = {
  "host:transfer": (ctx, message) => {
    const accepted = ctx.storage.transactionSync(() => {
      const host = getHostState(ctx.sql);
      if (
        host.hostUserId !== ctx.userId ||
        host.hostRevision !== message.expectedHostRevision ||
        getPhase(ctx.sql).kind !== "lobby" ||
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
          "引き継げませんでした。開始前に、接続中の別メンバーを選び直してください。",
      });
      return;
    }
    ctx.broadcaster.broadcastToAll({
      type: "host:updated",
      hostUserId: message.targetUserId,
      hostRevision: getHostState(ctx.sql).hostRevision,
    });
  },
};
