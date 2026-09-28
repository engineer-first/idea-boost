// 2軸マップのサイズと操作可否。永続サイズは room_state、進行中ドラッグは
// WebSocket attachment を真実とし、共有する一時状態は匿名 boolean だけにする。
import type { RoomPhase } from "../../contracts/phase";
import type {
  IdeaMapSizeLevel,
  ServerMessage,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { isHostUser } from "./members";
import { getPhase } from "./phase";

export type IdeaMapSizeState = {
  sizeLevel: IdeaMapSizeLevel;
  initialized: boolean;
};

export function isIdeaMapVisiblePhase(phase: RoomPhase): boolean {
  return (
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step === 2 || phase.step === 3)
  );
}

export function getIdeaMapSizeState(sql: SqlStorage): IdeaMapSizeState {
  const row = sql
    .exec(
      "SELECT idea_map_size_level, idea_map_size_initialized FROM room_state WHERE id = 1",
    )
    .toArray()[0] as
    | {
        idea_map_size_level: number;
        idea_map_size_initialized: number;
      }
    | undefined;
  return {
    sizeLevel: row?.idea_map_size_level ?? 0,
    initialized: row?.idea_map_size_initialized === 1,
  };
}

export function buildIdeaMapServerState(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  phase = getPhase(sql),
): Extract<ServerMessage, { type: "idea-map:state" }> {
  const size = getIdeaMapSizeState(sql);
  return {
    type: "idea-map:state",
    ...size,
    isDragging: isIdeaMapVisiblePhase(phase) && broadcaster.hasActiveDrag(),
  };
}

export function broadcastIdeaMapState(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
): void {
  broadcaster.broadcastToAll(buildIdeaMapServerState(sql, broadcaster));
}

function replyForbidden(ctx: HandlerCtx, message: string): void {
  ctx.reply({ type: "error", code: "forbidden", message });
}

export const ideaMapHandlers: MessageHandlers<"idea-map:resize"> = {
  "idea-map:resize": (ctx, message) => {
    const phase = getPhase(ctx.sql);
    if (!isIdeaMapVisiblePhase(phase)) {
      replyForbidden(
        ctx,
        "2軸マップを表示しているステップでのみ変更できます。",
      );
      return;
    }
    if (!isHostUser(ctx.sql, ctx.userId)) {
      replyForbidden(ctx, "2軸マップの広さを変更できるのはホストだけです。");
      return;
    }
    if (ctx.broadcaster.hasActiveDrag()) {
      replyForbidden(
        ctx,
        "付箋のドラッグ中は2軸マップの広さを変更できません。",
      );
      return;
    }
    if (!getIdeaMapSizeState(ctx.sql).initialized) {
      replyForbidden(ctx, "2軸マップの初期設定が完了していません。");
      return;
    }

    ctx.storage.transactionSync(() => {
      ctx.sql.exec(
        "UPDATE room_state SET idea_map_size_level = ?1 WHERE id = 1 AND idea_map_size_initialized = 1",
        message.sizeLevel,
      );
    });
    broadcastIdeaMapState(ctx.sql, ctx.broadcaster);
  },
};
