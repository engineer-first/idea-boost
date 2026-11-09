import { canSendSharingReaction } from "../../contracts/sharing-reactions";
import type { MessageHandlers } from "./handler-context";
import { isMember } from "./members";
import { getPhase, getPhaseRevision } from "./phase";

export const sharingReactionHandlers: MessageHandlers<"reaction:send"> = {
  "reaction:send": (ctx, message) => {
    // 参加先確認の非同期待機中に期限・在籍が失効した場合も配信しない。
    if (
      !ctx.broadcaster.authorize(ctx.ws) ||
      ctx.authorizeMutation?.() === false
    )
      return;
    if (
      !canSendSharingReaction(getPhase(ctx.sql)) ||
      message.phaseRevision !== getPhaseRevision(ctx.sql)
    ) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message:
          "リアクションは現在の課題・問い・アイデアの共有画面で送れます。",
      });
      return;
    }
    if (!ctx.broadcaster.reserveReaction(ctx.ws, message.phaseRevision)) return;
    // 本文・票・座標・表示名を含めず、保存・再送しない。
    // 上限の判定に使う送信者IDは、クライアント要求ではなく認証済みの値を使う。
    ctx.broadcaster.broadcastReaction(
      {
        type: "reaction:received",
        id: crypto.randomUUID(),
        senderId: ctx.userId,
        kind: message.kind,
        phaseRevision: message.phaseRevision,
      },
      (userId) => isMember(ctx.sql, userId),
    );
  },
};
