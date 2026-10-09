import type { SharingState } from "../../contracts/room-protocol";
import { syncRoomAlarm } from "./alarms";
import {
  type HandlerCtx,
  type MessageHandlers,
  runAuthorizedMutationTransaction,
} from "./handler-context";
import { isHostUser, isMember } from "./members";
import { getPhase } from "./phase";
import { getSharingState, saveSharingState } from "./sharing-state";
import { getTimerState, saveTimerState } from "./timer";

export function broadcastSharing(
  ctx: Pick<HandlerCtx, "sql" | "broadcaster">,
): void {
  const sharing = getSharingState(ctx.sql);
  if (sharing)
    ctx.broadcaster.broadcastToAll({
      type: "sharing:updated",
      sharing,
      timer: getTimerState(ctx.sql),
      serverNow: Date.now(),
    });
}

function controllableState(
  ctx: HandlerCtx,
  revision: string,
  allowPresenter: boolean = false,
): SharingState | null {
  const phase = getPhase(ctx.sql);
  const state = getSharingState(ctx.sql);
  const isPresenter =
    allowPresenter &&
    state?.status === "active" &&
    state.currentIndex !== null &&
    state.order[state.currentIndex]?.userId === ctx.userId;
  if (
    !isMember(ctx.sql, ctx.userId) ||
    (!isHostUser(ctx.sql, ctx.userId) && !isPresenter) ||
    phase.kind !== "step" ||
    phase.step !== 2
  ) {
    ctx.reply({
      type: "error",
      code: "forbidden",
      message:
        "共有の操作は共有ステップでホスト、発表完了は発表者本人も操作できます。",
    });
    return null;
  }
  // 版が一致しない再送・別画面の古い操作は現在状態を返すだけ。
  if (!state || state.revision !== revision || state.startsAt !== null) {
    if (state)
      ctx.reply({
        type: "sharing:updated",
        sharing: state,
        timer: getTimerState(ctx.sql),
        serverNow: Date.now(),
      });
    return null;
  }
  return state;
}

async function commitTurn(ctx: HandlerCtx, state: SharingState): Promise<void> {
  state.revision = crypto.randomUUID();
  state.currentIndex =
    state.results.length < state.order.length ? state.results.length : null;
  state.status = state.currentIndex === null ? "complete" : "active";
  state.startsAt = state.currentIndex === null ? null : Date.now() + 2000;
  // SQLite-backed DOではSQLとアラームを同じtransactionに含められる。
  // 予約失敗時にも発表者だけが進まないよう、通知はコミット後に限定する。
  const committed = await runAuthorizedMutationTransaction(ctx, async () => {
    saveSharingState(ctx.sql, state);
    saveTimerState(ctx.sql, { status: "idle" });
    await syncRoomAlarm(ctx.storage, ctx.sql);
    return true;
  });
  if (committed) broadcastSharing(ctx);
}

export const sharingHandlers: MessageHandlers<
  "sharing:start" | "sharing:advance"
> = {
  "sharing:start": async (ctx, message) => {
    const state = controllableState(ctx, message.revision);
    if (state?.status !== "ready") return;
    state.durationMs = message.durationMs;
    await commitTurn(ctx, state);
  },
  "sharing:advance": async (ctx, message) => {
    const state = controllableState(
      ctx,
      message.revision,
      message.outcome === "done",
    );
    if (state?.status !== "active") return;
    state.results.push(message.outcome);
    await commitTurn(ctx, state);
  },
};

export async function startPendingSharingTurn(
  ctx: Pick<HandlerCtx, "sql" | "storage" | "broadcaster">,
): Promise<boolean> {
  const sharing = getSharingState(ctx.sql);
  if (!sharing || sharing.startsAt === null) return false;
  if (sharing.startsAt > Date.now()) {
    await syncRoomAlarm(ctx.storage, ctx.sql);
    return true;
  }
  const serverNow = Date.now();
  const timer = {
    status: "running" as const,
    durationMs: sharing.durationMs,
    endsAt: serverNow + sharing.durationMs,
  };
  sharing.startsAt = null;
  await ctx.storage.transaction(async () => {
    saveSharingState(ctx.sql, sharing);
    saveTimerState(ctx.sql, timer);
    await syncRoomAlarm(ctx.storage, ctx.sql);
  });
  broadcastSharing(ctx);
  return true;
}
