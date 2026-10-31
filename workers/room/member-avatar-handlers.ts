import { isLobby } from "../../contracts/phase";
import { type MessageHandlers, replyForbidden } from "./handler-context";
import { availableMemberAvatars } from "./member-avatars";
import { findMember } from "./members";
import { getPhase } from "./phase";

export const memberAvatarHandlers: MessageHandlers<"member:randomize-avatar"> =
  {
    "member:randomize-avatar": (ctx, message) => {
      if (ctx.authorizeMutation?.() === false) {
        replyForbidden(ctx);
        return;
      }
      const member = findMember(ctx.sql, ctx.userId);
      if (!member || !isLobby(getPhase(ctx.sql))) {
        replyForbidden(ctx);
        return;
      }
      const available = availableMemberAvatars(ctx.sql);
      if (available.length === 0) {
        ctx.reply({
          type: "error",
          code: "avatar-unavailable",
          message: "未使用のアイコンがないため変更できません。",
        });
        return;
      }
      const avatarId = available[Math.floor(Math.random() * available.length)];
      ctx.sql.exec(
        "UPDATE member_avatar_assignments SET avatar_id=? WHERE user_id=?",
        avatarId,
        ctx.userId,
      );
      // 顔と残り候補数は、名前・識別色と同じルーム全員の共有情報。
      ctx.broadcaster.broadcastToAll({
        type: "member:avatar-updated",
        member: { ...member, avatarId },
        availableAvatarCount: available.length,
        operationId: message.operationId,
      });
    },
  };
