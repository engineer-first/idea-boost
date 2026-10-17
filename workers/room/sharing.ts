import type { SharingState } from "../../contracts/room-protocol";
import { syncRoomAlarm } from "./alarms";
import {
  type HandlerCtx,
  type MessageHandlers,
  runAuthorizedMutationTransaction,
} from "./handler-context";
import { isMember } from "./members";
import { getPhase, getPhaseRevision, phaseHandlers } from "./phase";
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
): SharingState | null {
  const phase = getPhase(ctx.sql);
  const state = getSharingState(ctx.sql);
  if (
    !isMember(ctx.sql, ctx.userId) ||
    phase.kind !== "step" ||
    phase.step !== 2
  ) {
    ctx.reply({
      type: "error",
      code: "forbidden",
      message: "共有の操作は共有ステップの参加者が行えます。",
    });
    return null;
  }
  // 認証済みメンバーの古い要求は権限判定より先に現在状態へ収束させる。
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

async function advanceAfterFinalPresenter(
  ctx: HandlerCtx,
  state: SharingState,
): Promise<void> {
  if (state.status !== "complete") return;
  const phase = getPhase(ctx.sql);
  if (phase.kind !== "step" || phase.step !== 2) return;
  await phaseHandlers["phase:next"](ctx, {
    type: "phase:next",
    expectedPhase: phase,
    expectedRevision: getPhaseRevision(ctx.sql),
  });
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
    const state = controllableState(ctx, message.revision);
    if (state?.status !== "active") return;
    state.results.push(message.outcome);
    await commitTurn(ctx, state);
    await advanceAfterFinalPresenter(ctx, state);
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
