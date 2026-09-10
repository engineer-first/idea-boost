// 名前付きカーソルの非永続中継。受信者に送る本人情報は、クライアント入力では
// なく認証済みソケットと members テーブルから組み立てる。

import { isIdeaValueFeasibilityMapCoordinate } from "../../contracts/board";
import { isCursorSharingAllowed } from "../../contracts/phase";
import type { SocketAttachment } from "./broadcast";
import type { MessageHandlers } from "./handler-context";
import { findMember } from "./members";
import { canEdit, findNote } from "./notes";
import { getBoardMutationForbiddenMessage, getPhase } from "./phase";

export const presenceHandlers: MessageHandlers<
  "cursor:update" | "cursor:leave"
> = {
  "cursor:update": (ctx, message) => {
    const phase = getPhase(ctx.sql);
    if (!isCursorSharingAllowed(phase)) return;
    if (
      phase.kind === "step" &&
      phase.phase === 3 &&
      (!isIdeaValueFeasibilityMapCoordinate(message.x) ||
        !isIdeaValueFeasibilityMapCoordinate(message.y))
    ) {
      return;
    }

    if (message.draggingNoteId) {
      const row = findNote(ctx.sql, message.draggingNoteId);
      if (!row) return;
      if (
        row.visibility !== "shared" ||
        phase.kind !== "step" ||
        row.phase !== phase.phase ||
        !canEdit(row, ctx.userId) ||
        getBoardMutationForbiddenMessage(phase, {
          type: "note:drag",
          noteId: message.draggingNoteId,
          x: message.x,
          y: message.y,
        }) !== null
      ) {
        // private / 別フェーズ / 存在しない付箋の有無を配信結果から推測させない。
        return;
      }
    }

    const member = findMember(ctx.sql, ctx.userId);
    if (!member) return;
    const attachment =
      (ctx.ws.deserializeAttachment() as SocketAttachment | null) ?? {
        userId: ctx.userId,
      };
    ctx.ws.serializeAttachment({
      ...attachment,
      hasCursor: true,
    } satisfies SocketAttachment);
    ctx.broadcaster.broadcastToAllExcept(
      {
        type: "cursor:updated",
        cursor: {
          ...member,
          x: message.x,
          y: message.y,
          draggingNoteId: message.draggingNoteId ?? null,
        },
      },
      ctx.userId,
    );
  },
  "cursor:leave": (ctx) => {
    const attachment =
      ctx.ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.hasCursor) return;
    ctx.ws.serializeAttachment({
      ...attachment,
      hasCursor: false,
      activeDragNoteId: undefined,
    } satisfies SocketAttachment);
    ctx.broadcaster.broadcastToAllExcept(
      { type: "cursor:left", userId: ctx.userId },
      ctx.userId,
    );
  },
};
