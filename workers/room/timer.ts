// ルーム共有タイマーの状態と終了時刻の真実。
// 遷移計算は純粋関数 transitionTimer に分離し、ハンドラは
// 「状態遷移 → 保存 → 全員配信」の定型だけを持つ。
import type { TimerState } from "../../contracts/room-protocol";
import { syncRoomAlarm } from "./alarms";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { getSharingState } from "./sharing-state";

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

// 時間切れ後に追加できる時間。
const EXTENSION_UNIT_MS = 60_000;

export function transitionTimer(
  current: TimerState,
  action: TimerAction,
  now: number,
): TimerTransition {
  switch (action.kind) {
    case "start": {
      // 新しいタイマーは未開始時だけ開始し、終了後は1回の延長に限定する。
      if (current.status !== "idle") {
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
      return { type: "invalid" };
    }
    case "resume": {
      if (current.status !== "paused") return { type: "invalid" };
      if (current.remainingMs <= 0) {
        return {
          type: "updated",
          timer: {
            status: "ended",
            durationMs: current.durationMs,
            ...(current.extensionUsed ? { extensionUsed: true } : {}),
          },
        };
      }
      return {
        type: "updated",
        timer: {
          status: "running",
          endsAt: now + current.remainingMs,
          durationMs: current.durationMs,
          ...(current.extensionUsed ? { extensionUsed: true } : {}),
        },
      };
    }
    case "extend": {
      if (current.status !== "ended" || current.extensionUsed)
        return { type: "invalid" };
      return {
        type: "updated",
        timer: {
          status: "running",
          endsAt: now + EXTENSION_UNIT_MS,
          durationMs: EXTENSION_UNIT_MS,
          extensionUsed: true,
        },
      };
    }
    case "stop": {
      if (current.status === "idle" || current.status === "ended") {
        return { type: "noop" };
      }
      if (current.status !== "paused") return { type: "invalid" };
      return {
        type: "updated",
        timer: {
          status: "ended",
          durationMs: current.durationMs,
          ...(current.extensionUsed ? { extensionUsed: true } : {}),
        },
      };
    }
  }
}

function readTimerState(sql: SqlStorage): TimerState {
  const row = sql
    .exec(
      "SELECT status, ends_at, remaining_ms, duration_ms, extension_used FROM timer_state WHERE id = 1",
    )
    .toArray()[0] as
    | {
        status: "idle" | "running" | "paused" | "ended";
        ends_at: number | null;
        remaining_ms: number | null;
        duration_ms: number | null;
        extension_used: number;
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
      ...(row.extension_used === 1 ? { extensionUsed: true } : {}),
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
      ...(row.extension_used === 1 ? { extensionUsed: true } : {}),
    };
  }
  if (row.status === "ended" && row.duration_ms !== null) {
    return {
      status: "ended",
      durationMs: row.duration_ms,
      ...(row.extension_used === 1 ? { extensionUsed: true } : {}),
    };
  }
  return { status: "idle" };
}

export function getTimerState(sql: SqlStorage, now = Date.now()): TimerState {
  const timer = readTimerState(sql);
  if (timer.status === "running" && timer.endsAt <= now) {
    return {
      status: "ended",
      durationMs: timer.durationMs,
      ...(timer.extensionUsed ? { extensionUsed: true } : {}),
    };
  }
  return timer;
}

export function saveTimerState(sql: SqlStorage, timer: TimerState): void {
  if (timer.status === "idle") {
    sql.exec(
      "UPDATE timer_state SET status = 'idle', ends_at = NULL, remaining_ms = NULL, duration_ms = NULL, extension_used = 0 WHERE id = 1",
    );
    return;
  }
  if (timer.status === "running") {
    sql.exec(
      "UPDATE timer_state SET status = 'running', ends_at = ?1, remaining_ms = NULL, duration_ms = ?2, extension_used = ?3 WHERE id = 1",
      timer.endsAt,
      timer.durationMs,
      timer.extensionUsed ? 1 : 0,
    );
    return;
  }
  if (timer.status === "ended") {
    sql.exec(
      "UPDATE timer_state SET status = 'ended', ends_at = NULL, remaining_ms = NULL, duration_ms = ?1, extension_used = ?2 WHERE id = 1",
      timer.durationMs,
      timer.extensionUsed ? 1 : 0,
    );
    return;
  }
  sql.exec(
    "UPDATE timer_state SET status = 'paused', ends_at = NULL, remaining_ms = ?1, duration_ms = ?2, extension_used = ?3 WHERE id = 1",
    timer.remainingMs,
    timer.durationMs,
    timer.extensionUsed ? 1 : 0,
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
    timer: {
      status: "ended",
      durationMs: current.durationMs,
      ...(current.extensionUsed ? { extensionUsed: true } : {}),
    },
  };
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
  const sharing = getSharingState(ctx.sql);
  if (
    sharing &&
    sharing.status !== "inactive" &&
    (sharing.startsAt !== null ||
      (sharing.status !== "active" && action.kind === "extend") ||
      (sharing.status === "ready" && action.kind === "start"))
  ) {
    replyTimerInvalidState(ctx);
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
  await syncRoomAlarm(ctx.storage, ctx.sql);
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
