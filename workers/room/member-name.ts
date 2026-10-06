// 呼び名は在籍者全員の共有情報。識別・権限・付箋・保存済み記録を変更しない。
import type { MessageHandlers } from "./handler-context";
import { findMember } from "./members";
import { getSharingState, saveSharingState } from "./sharing-state";

export const memberNameHandlers: MessageHandlers<"member:rename"> = {
  "member:rename": (ctx, message) => {
    const previous = findMember(ctx.sql, ctx.userId);
    if (!previous) return;
    const member = { ...previous, name: message.name };
    ctx.storage.transactionSync(() => {
      ctx.sql.exec(
        "INSERT INTO member_display_names(user_id,name) VALUES(?1,?2) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name",
        ctx.userId,
        message.name,
      );
      ctx.sql.exec(
        "UPDATE members SET name=?2 WHERE user_id=?1",
        ctx.userId,
        message.name,
      );
      const sharing = getSharingState(ctx.sql);
      if (sharing)
        saveSharingState(ctx.sql, {
          ...sharing,
          order: sharing.order.map((entry) =>
            entry.userId === ctx.userId ? member : entry,
          ),
        });
    });
    ctx.broadcaster.broadcastToAll({
      type: "member:renamed",
      member,
      operationId: message.operationId,
    });
  },
};
