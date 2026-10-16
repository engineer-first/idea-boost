import type { MessageHandlers } from "./handler-context";

export function getRoomName(sql: SqlStorage): string | null {
  const identity = sql
    .exec<{ room_name: string | null }>(
      "SELECT room_name FROM shared_outcome_identity WHERE id=1",
    )
    .toArray()[0];
  return identity?.room_name ?? null;
}

// ルーム名はメンバー・進行状態と同じく、在籍する参加者全員へ共有する情報。
// 認証・在籍・完了・期限のガードは RoomDO の共通入口で適用する。
export const roomNameHandlers: MessageHandlers<"room:rename"> = {
  "room:rename": (ctx, message) => {
    if (ctx.authorizeMutation?.() === false) {
      ctx.broadcaster.authorize(ctx.ws);
      return;
    }
    ctx.sql.exec(
      "UPDATE shared_outcome_identity SET room_name=? WHERE id=1",
      message.name,
    );
    ctx.broadcaster.broadcastToAll({
      type: "room:renamed",
      name: message.name,
      operationId: message.operationId,
    });
  },
};
