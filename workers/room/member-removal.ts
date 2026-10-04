import { isRoomClosed } from "./completed-rooms";
import type { MessageHandlers } from "./handler-context";
import { getHostState, isMember } from "./members";
import { getPendingPhaseTransition } from "./phase";

export const memberRemovalHandlers: MessageHandlers<"member:remove"> = {
  "member:remove": (ctx, message) => {
    const host = getHostState(ctx.sql);
    if (
      host.hostUserId !== ctx.userId ||
      host.hostRevision !== message.expectedHostRevision ||
      isRoomClosed(ctx.sql) ||
      getPendingPhaseTransition(ctx.sql) !== null ||
      message.targetUserId === ctx.userId ||
      !isMember(ctx.sql, message.targetUserId) ||
      !ctx.leaveMember
    ) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message:
          "メンバーを外せませんでした。進行処理が終わってから、現在のメンバーを選び直してください。",
      });
      return;
    }
    // ここまでの認可と会員削除は、同じDOイベント内で同期的に完結する。
    // 未接続のメンバーも対象とし、付箋・票・色の履歴は通常退出と同様に保持する。
    ctx.leaveMember(message.targetUserId);
    ctx.reply({
      type: "member:removed",
      targetUserId: message.targetUserId,
      operationId: message.operationId,
    });
  },
};
