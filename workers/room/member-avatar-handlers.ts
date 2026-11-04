import { isLobby } from "../../contracts/phase";
import { type MessageHandlers, replyForbidden } from "./handler-context";
import { cycleMemberAvatar } from "./member-avatars";
import { findMember } from "./members";
import { getPhase } from "./phase";

export const memberAvatarHandlers: MessageHandlers<"member:cycle-avatar"> = {
  "member:cycle-avatar": (ctx, message) => {
    if (ctx.authorizeMutation?.() === false) {
      replyForbidden(ctx);
      return;
    }
    const member = findMember(ctx.sql, ctx.userId);
    if (!member || !isLobby(getPhase(ctx.sql))) {
      replyForbidden(ctx);
      return;
    }
    const avatarId = cycleMemberAvatar(ctx.sql, ctx.userId);
    // 顔は名前・識別色と同じルーム全員の共有情報。
    ctx.broadcaster.broadcastToAll({
      type: "member:avatar-updated",
      member: { ...member, avatarId },
      operationId: message.operationId,
    });
  },
};
