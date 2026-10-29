// 名前付きカーソルの非永続中継。受信者に送る本人情報は、クライアント入力では
// なく認証済みソケットと members テーブルから組み立てる。

import {
  isCursorSharingAllowed,
  isPresenterViewFollowStep,
} from "../../contracts/phase";
import type { SocketAttachment } from "./broadcast";
import type { MessageHandlers } from "./handler-context";
import { broadcastIdeaMapState, isIdeaMapVisiblePhase } from "./idea-map";
import { findMember } from "./members";
import {
  canShareMovePresence,
  releaseConnectionMoves,
  syncMovePresence,
} from "./move-operations";
import { broadcastNoteUpdated, canEdit, findNote } from "./notes";
import { getBoardMutationForbiddenMessage, getPhase } from "./phase";
import { getSharingState } from "./sharing-state";

export const presenceHandlers: MessageHandlers<
  "cursor:update" | "cursor:leave" | "view:update" | "presenter-follow:update"
> = {
  "view:update": (ctx, message) => {
    const phase = getPhase(ctx.sql);

    // 視点共有は対象フェーズでのみ受け付ける。
    if (!isPresenterViewFollowStep(phase)) return;

    const sharing = getSharingState(ctx.sql);

    // 発表が実際に進行中で、発表者が確定していることを確認する。
    if (
      sharing?.status !== "active" ||
      sharing.startsAt !== null ||
      sharing.currentIndex === null
    ) {
      return;
    }

    const presenter = sharing.order[sharing.currentIndex];

    // 発表者本人から送信された視点だけを中継する。
    if (!presenter || presenter.userId !== ctx.userId) return;

    ctx.broadcaster.broadcastToAllExcept(
      {
        type: "view:updated",
        userId: ctx.userId,
        view: message.view,
      },
      ctx.userId,
    );
  },
  "presenter-follow:update": (ctx, message) => {
    // 以前のフォロー先を先に解除する。
    // 新しい発表者へ切り替える場合も、古い発表者の状態を更新できる。
    const previousPresenterId = ctx.broadcaster.setPresenterFollow(
      ctx.ws,
      null,
    );

    if (!message.isFollowing) {
      if (previousPresenterId) {
        ctx.broadcaster.broadcastPresenterFollowStatus(previousPresenterId);
      }
      return;
    }

    const phase = getPhase(ctx.sql);
    const sharing = getSharingState(ctx.sql);

    const isSharingActive =
      sharing !== null &&
      sharing.status === "active" &&
      sharing.startsAt === null &&
      sharing.currentIndex !== null;

    const presenter = isSharingActive
      ? (sharing.order[sharing.currentIndex!] ?? null)
      : null;

    // 対象フェーズ外、共有開始前、発表者不在、
    // または発表者自身からのフォロー要求は受け付けない。
    if (
      !isPresenterViewFollowStep(phase) ||
      !isSharingActive ||
      !presenter ||
      presenter.userId === ctx.userId ||
      !findMember(ctx.sql, ctx.userId)
    ) {
      if (previousPresenterId) {
        ctx.broadcaster.broadcastPresenterFollowStatus(previousPresenterId);
      }
      return;
    }

    ctx.broadcaster.setPresenterFollow(ctx.ws, presenter.userId);

    // 発表者が変わった場合は、以前の発表者にも解除状態を通知する。
    if (previousPresenterId && previousPresenterId !== presenter.userId) {
      ctx.broadcaster.broadcastPresenterFollowStatus(previousPresenterId);
    }

    ctx.broadcaster.broadcastPresenterFollowStatus(presenter.userId);
  },
  "cursor:update": (ctx, message) => {
    const phase = getPhase(ctx.sql);
    if (!isCursorSharingAllowed(phase)) return;

    if (message.draggingNoteId) {
      const active = ctx.broadcaster.activeDragFor(ctx.ws);
      const row = findNote(ctx.sql, message.draggingNoteId);
      if (!row) return;
      if (
        row.visibility !== "shared" ||
        phase.kind !== "step" ||
        row.phase !== phase.phase ||
        !canEdit(row, ctx.userId) ||
        (!canShareMovePresence(ctx, message.draggingNoteId) &&
          active?.noteId !== message.draggingNoteId) ||
        getBoardMutationForbiddenMessage(phase, {
          type: "note:drag:move",
          noteId: message.draggingNoteId,
          dragId: active?.dragId ?? "",
          // フェーズの操作可否は付箋の位置で判定する。
          // 余白を含むcursor位置を付箋の評価位置として検証しない。
          x: row.x,
          y: row.y,
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
    const previousAttachment =
      ctx.ws.deserializeAttachment() as SocketAttachment | null;
    if (
      !previousAttachment ||
      (!previousAttachment.hasCursor &&
        !previousAttachment.activeDrag &&
        !previousAttachment.activeMoveOperationId)
    ) {
      return;
    }
    if (
      previousAttachment.moveConnectionId &&
      previousAttachment.activeMoveOperationId
    ) {
      releaseConnectionMoves(ctx.sql, previousAttachment.moveConnectionId);
      syncMovePresence(ctx.sql, ctx.broadcaster);
    }
    const active = ctx.broadcaster.retireActiveDrag(ctx.ws);
    const attachment =
      (ctx.ws.deserializeAttachment() as SocketAttachment | null) ??
      previousAttachment;
    ctx.ws.serializeAttachment({
      ...attachment,
      hasCursor: false,
    } satisfies SocketAttachment);
    if (active) {
      const row = findNote(ctx.sql, active.noteId);
      if (row?.visibility === "shared") {
        broadcastNoteUpdated(ctx.sql, ctx.broadcaster, row);
      }
      const phase = getPhase(ctx.sql);
      if (isIdeaMapVisiblePhase(phase)) {
        broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
      }
    }
    if (ctx.broadcaster.hasOtherPresenceForUser(ctx.userId, ctx.ws)) {
      if (active) {
        ctx.broadcaster.broadcastToAllExcept(
          { type: "cursor:drag-ended", userId: ctx.userId },
          ctx.userId,
        );
      }
      return;
    }
    ctx.broadcaster.broadcastToAllExcept(
      { type: "cursor:left", userId: ctx.userId },
      ctx.userId,
    );
  },
};
