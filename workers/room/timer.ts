// ルーム共有タイマーの状態と終了時刻の真実。
// 遷移計算は純粋関数 transitionTimer に分離し、ハンドラは
// 「ホスト確認 → 遷移 → 保存 → 全員配信」の定型だけを持つ。
import {
  TIMER_MAX_DURATION_MS,
  type TimerState,
} from "../../contracts/room-protocol";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { isHostUser } from "./members";

export type TimerAction =
  | { kind: "start"; durationMs: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "extend" }
  | { kind: "stop" };

// 遷移結果。invalid は「その状態ではできない操作」で、呼び出し元が
// エラー返信に変換する。noop は正常だが変化なし（idle への stop）。
export type TimerTransition =
  | { type: "updated"; timer: TimerState }
  | { type: "noop" }
  | { type: "invalid" };

// 1回の延長幅。上限（TIMER_MAX_DURATION_MS）までの残り幅しか延長しない。
const EXTENSION_UNIT_MS = 60_000;

export function transitionTimer(
  current: TimerState,
  action: TimerAction,
  now: number,
): TimerTransition {
  switch (action.kind) {
    case "start": {
      // start は未設定または終了後の再設定専用。実行中・一時停止中の
      // リセットは許可せず、既存の共有状態を壊さない。
      if (current.status !== "idle" && current.status !== "ended") {
        return { type: "invalid" };
      }
      return {
        type: "updated",
        timer: {
          status: "running",
          endsAt: now + action.durationMs,
          durationMs: action.durationMs,
        },
      };
    }
    case "pause": {
      if (current.status !== "running") return { type: "invalid" };
      if (current.endsAt <= now) {
        return {
          type: "updated",
          timer: { status: "ended", durationMs: current.durationMs },
        };
      }
      return {
        type: "updated",
        timer: {
          status: "paused",
          remainingMs: Math.max(0, current.endsAt - now),
          durationMs: current.durationMs,
        },
      };
    }
    case "resume": {
      if (current.status !== "paused") return { type: "invalid" };
      if (current.remainingMs <= 0) {
        return {
          type: "updated",
          timer: { status: "ended", durationMs: current.durationMs },
        };
      }
      return {
        type: "updated",
        timer: {
          status: "running",
          endsAt: now + current.remainingMs,
          durationMs: current.durationMs,
        },
      };
    }
    case "extend": {
      if (current.status !== "running" || current.endsAt <= now) {
        return { type: "invalid" };
      }
      const extensionMs = Math.min(
        EXTENSION_UNIT_MS,
        TIMER_MAX_DURATION_MS - current.durationMs,
      );
      if (extensionMs <= 0) return { type: "invalid" };
      if (current.status === "running") {
        return {
          type: "updated",
          timer: {
            status: "running",
            endsAt: current.endsAt + extensionMs,
            durationMs: current.durationMs + extensionMs,
          },
        };
      }
      return { type: "invalid" };
    }
    case "stop": {
      if (current.status === "idle" || current.status === "ended") {
        return { type: "noop" };
      }
      if (current.status !== "paused") return { type: "invalid" };
      return {
        type: "updated",
        timer: { status: "ended", durationMs: current.durationMs },
      };
    }
  }
}

function readTimerState(sql: SqlStorage): TimerState {
  const row = sql
    .exec(
      "SELECT status, ends_at, remaining_ms, duration_ms FROM timer_state WHERE id = 1",
    )
    .toArray()[0] as
    | {
        status: "idle" | "running" | "paused" | "ended";
        ends_at: number | null;
        remaining_ms: number | null;
        duration_ms: number | null;
      }
    | undefined;
  if (!row || row.status === "idle") return { status: "idle" };
  if (
    row.status === "running" &&
    row.ends_at !== null &&
    row.duration_ms !== null
  ) {
    return {
      status: "running",
      endsAt: row.ends_at,
      durationMs: row.duration_ms,
    };
  }
  if (
    row.status === "paused" &&
    row.remaining_ms !== null &&
    row.duration_ms !== null
  ) {
    return {
      status: "paused",
      remainingMs: row.remaining_ms,
      durationMs: row.duration_ms,
    };
  }
  if (row.status === "ended" && row.duration_ms !== null) {
    return { status: "ended", durationMs: row.duration_ms };
  }
  return { status: "idle" };
}

export function getTimerState(sql: SqlStorage, now = Date.now()): TimerState {
  const timer = readTimerState(sql);
  if (timer.status === "running" && timer.endsAt <= now) {
    return { status: "ended", durationMs: timer.durationMs };
  }
  return timer;
}

function saveTimerState(sql: SqlStorage, timer: TimerState): void {
  if (timer.status === "idle") {
    sql.exec(
      "UPDATE timer_state SET status = 'idle', ends_at = NULL, remaining_ms = NULL, duration_ms = NULL WHERE id = 1",
    );
    return;
  }
  if (timer.status === "running") {
    sql.exec(
      "UPDATE timer_state SET status = 'running', ends_at = ?1, remaining_ms = NULL, duration_ms = ?2 WHERE id = 1",
      timer.endsAt,
      timer.durationMs,
    );
    return;
  }
  if (timer.status === "ended") {
    sql.exec(
      "UPDATE timer_state SET status = 'ended', ends_at = NULL, remaining_ms = NULL, duration_ms = ?1 WHERE id = 1",
      timer.durationMs,
    );
    return;
  }
  sql.exec(
    "UPDATE timer_state SET status = 'paused', ends_at = NULL, remaining_ms = ?1, duration_ms = ?2 WHERE id = 1",
    timer.remainingMs,
    timer.durationMs,
  );
}

// phase:next と同じトランザクション内で使う内部操作。すでに idle なら
// 書き込みも追加配信も不要なので false を返す。
export function resetTimerState(sql: SqlStorage): boolean {
  if (getTimerState(sql).status === "idle") return false;
  saveTimerState(sql, { status: "idle" });
  return true;
}

export function expireTimer(current: TimerState, now: number): TimerTransition {
  if (current.status !== "running" || current.endsAt > now) {
    return { type: "noop" };
  }
  return {
    type: "updated",
    timer: { status: "ended", durationMs: current.durationMs },
  };
}

async function syncTimerAlarm(
  storage: DurableObjectStorage,
  timer: TimerState,
): Promise<void> {
  if (timer.status === "running") {
    await storage.setAlarm(timer.endsAt);
    return;
  }
  await storage.deleteAlarm();
}

function canControlTimer(sql: SqlStorage, userId: string): boolean {
  return isHostUser(sql, userId);
}

function replyTimerForbidden(ctx: HandlerCtx): void {
  ctx.reply({
    type: "error",
    code: "forbidden",
    message: "タイマーはホストのみ操作できます。",
  });
}

function replyTimerInvalidState(ctx: HandlerCtx): void {
  ctx.reply({
    type: "error",
    code: "forbidden",
    message: "この状態ではその操作はできません。",
  });
}

async function applyTimerAction(
  ctx: HandlerCtx,
  action: TimerAction,
): Promise<void> {
  if (!canControlTimer(ctx.sql, ctx.userId)) {
    replyTimerForbidden(ctx);
    return;
  }
  const serverNow = Date.now();
  const result = transitionTimer(getTimerState(ctx.sql), action, serverNow);
  if (result.type === "invalid") {
    replyTimerInvalidState(ctx);
    return;
  }
  if (result.type === "noop") return;
  saveTimerState(ctx.sql, result.timer);
  await syncTimerAlarm(ctx.storage, result.timer);
  ctx.broadcaster.broadcastToAll({
    type: "timer:updated",
    timer: result.timer,
    serverNow,
  });
}

export const timerHandlers: MessageHandlers<
  "timer:start" | "timer:pause" | "timer:resume" | "timer:extend" | "timer:stop"
> = {
  "timer:start": (ctx, message) =>
    applyTimerAction(ctx, { kind: "start", durationMs: message.durationMs }),
  "timer:pause": (ctx) => applyTimerAction(ctx, { kind: "pause" }),
  "timer:resume": (ctx) => applyTimerAction(ctx, { kind: "resume" }),
  "timer:extend": (ctx) => applyTimerAction(ctx, { kind: "extend" }),
  "timer:stop": (ctx) => applyTimerAction(ctx, { kind: "stop" }),
};

export async function handleTimerAlarm(
  sql: SqlStorage,
  broadcaster: HandlerCtx["broadcaster"],
): Promise<void> {
  const result = expireTimer(readTimerState(sql), Date.now());
  if (result.type !== "updated") return;
  saveTimerState(sql, result.timer);
  broadcaster.broadcastToAll({
    type: "timer:updated",
    timer: result.timer,
    serverNow: Date.now(),
  });
}
