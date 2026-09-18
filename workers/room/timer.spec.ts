// transitionTimer（純粋関数）の遷移表テスト。
// 認可・永続化・配信を含めた DO 越しの振る舞いは room-protocol.spec.ts が
// 担い、ここでは境界値を含む遷移計算だけを固定する。
import { describe, expect, it, vi } from "vitest";
import {
  TIMER_MAX_DURATION_MS,
  type TimerState,
} from "../../contracts/room-protocol";
import type { HandlerCtx } from "./handler-context";
import { timerHandlers, transitionTimer } from "./timer";

const NOW = 1_720_000_000_000;

const running = (endsAt: number, durationMs: number): TimerState => ({
  status: "running",
  endsAt,
  durationMs,
});

const paused = (remainingMs: number, durationMs: number): TimerState => ({
  status: "paused",
  remainingMs,
  durationMs,
});

function timerHandlerContext(
  initialTimer: TimerState,
  storage: Pick<DurableObjectStorage, "setAlarm" | "deleteAlarm">,
): {
  ctx: HandlerCtx;
  broadcast: ReturnType<typeof vi.fn>;
} {
  const sql = {
    exec(query: string) {
      if (query.startsWith("SELECT host_id")) {
        return { toArray: () => [{ host_id: "host" }] };
      }
      if (query.startsWith("SELECT status")) {
        if (initialTimer.status === "idle") {
          return {
            toArray: () => [
              {
                status: "idle",
                ends_at: null,
                remaining_ms: null,
                duration_ms: null,
              },
            ],
          };
        }
        if (initialTimer.status === "running") {
          return {
            toArray: () => [
              {
                status: "running",
                ends_at: initialTimer.endsAt,
                remaining_ms: null,
                duration_ms: initialTimer.durationMs,
              },
            ],
          };
        }
        if (initialTimer.status === "paused") {
          return {
            toArray: () => [
              {
                status: "paused",
                ends_at: null,
                remaining_ms: initialTimer.remainingMs,
                duration_ms: initialTimer.durationMs,
              },
            ],
          };
        }
        return {
          toArray: () => [
            {
              status: "ended",
              ends_at: null,
              remaining_ms: null,
              duration_ms: initialTimer.durationMs,
            },
          ],
        };
      }
      return { toArray: () => [] };
    },
  } as unknown as SqlStorage;
  const broadcast = vi.fn();
  return {
    ctx: {
      sql,
      storage: storage as DurableObjectStorage,
      userId: "host",
      ws: {} as WebSocket,
      reply: vi.fn(),
      broadcaster: {
        broadcastToAll: broadcast,
      } as unknown as HandlerCtx["broadcaster"],
      refreshSnapshots: vi.fn(),
    },
    broadcast,
  };
}

describe("transitionTimer: start", () => {
  it("idle から start すると durationMs ぶん先を期限に running になる", () => {
    expect(
      transitionTimer(
        { status: "idle" },
        { kind: "start", durationMs: 300_000 },
        NOW,
      ),
    ).toEqual({
      type: "updated",
      timer: running(NOW + 300_000, 300_000),
    });
  });

  it.each<[string, TimerState]>([
    ["running", running(NOW + 1_000, 60_000)],
    ["paused", paused(1_000, 60_000)],
  ])("%s からの start は invalid（リセットは stop 経由）", (_label, current) => {
    expect(
      transitionTimer(current, { kind: "start", durationMs: 60_000 }, NOW),
    ).toEqual({ type: "invalid" });
  });
});

describe("transitionTimer: pause / resume", () => {
  it("running を pause すると残り時間を保持した paused になる", () => {
    expect(
      transitionTimer(running(NOW + 42_000, 300_000), { kind: "pause" }, NOW),
    ).toEqual({
      type: "updated",
      timer: paused(42_000, 300_000),
    });
  });

  it("期限を過ぎた running の pause は ended に確定する", () => {
    expect(
      transitionTimer(running(NOW - 1, 300_000), { kind: "pause" }, NOW),
    ).toEqual({
      type: "updated",
      timer: { status: "ended", durationMs: 300_000 },
    });
  });

  it.each<[string, TimerState]>([
    ["idle", { status: "idle" }],
    ["paused", paused(1_000, 60_000)],
  ])("%s からの pause は invalid", (_label, current) => {
    expect(transitionTimer(current, { kind: "pause" }, NOW)).toEqual({
      type: "invalid",
    });
  });

  it("paused を resume すると残り時間ぶん先を期限に running へ戻る", () => {
    expect(
      transitionTimer(paused(42_000, 300_000), { kind: "resume" }, NOW),
    ).toEqual({
      type: "updated",
      timer: running(NOW + 42_000, 300_000),
    });
  });

  it.each<[string, TimerState]>([
    ["idle", { status: "idle" }],
    ["running", running(NOW + 1_000, 60_000)],
  ])("%s からの resume は invalid", (_label, current) => {
    expect(transitionTimer(current, { kind: "resume" }, NOW)).toEqual({
      type: "invalid",
    });
  });
});

describe("transitionTimer: extend", () => {
  it("running の extend は endsAt と durationMs を 1 分延長する", () => {
    expect(
      transitionTimer(running(NOW + 30_000, 300_000), { kind: "extend" }, NOW),
    ).toEqual({
      type: "updated",
      timer: running(NOW + 30_000 + 60_000, 360_000),
    });
  });

  it("期限切れの running を extend できない", () => {
    expect(
      transitionTimer(running(NOW - 10_000, 300_000), { kind: "extend" }, NOW),
    ).toEqual({ type: "invalid" });
  });

  it("上限との差が 1 分未満なら差分だけ延長する", () => {
    const durationMs = TIMER_MAX_DURATION_MS - 30_000;
    expect(
      transitionTimer(
        running(NOW + 10_000, durationMs),
        { kind: "extend" },
        NOW,
      ),
    ).toEqual({
      type: "updated",
      timer: running(NOW + 10_000 + 30_000, TIMER_MAX_DURATION_MS),
    });
  });

  it("上限に達している running の extend は invalid", () => {
    expect(
      transitionTimer(
        running(NOW + 10_000, TIMER_MAX_DURATION_MS),
        { kind: "extend" },
        NOW,
      ),
    ).toEqual({ type: "invalid" });
  });

  it("paused の extend は invalid（再開・終了だけを公開する）", () => {
    expect(
      transitionTimer(paused(42_000, 300_000), { kind: "extend" }, NOW),
    ).toEqual({ type: "invalid" });
  });

  it("上限に達している paused の extend は invalid", () => {
    expect(
      transitionTimer(
        paused(42_000, TIMER_MAX_DURATION_MS),
        { kind: "extend" },
        NOW,
      ),
    ).toEqual({ type: "invalid" });
  });

  it("idle の extend は invalid", () => {
    expect(
      transitionTimer({ status: "idle" }, { kind: "extend" }, NOW),
    ).toEqual({ type: "invalid" });
  });
});

describe("transitionTimer: stop", () => {
  it.each<[string, TimerState]>([
    ["paused", paused(1_000, 60_000)],
  ])("%s の stop は ended への更新", (_label, current) => {
    expect(transitionTimer(current, { kind: "stop" }, NOW)).toEqual({
      type: "updated",
      timer: { status: "ended", durationMs: 60_000 },
    });
  });

  it("running の stop は invalid", () => {
    expect(
      transitionTimer(running(NOW + 1_000, 60_000), { kind: "stop" }, NOW),
    ).toEqual({ type: "invalid" });
  });

  it("idle の stop はエラーではなく noop", () => {
    expect(transitionTimer({ status: "idle" }, { kind: "stop" }, NOW)).toEqual({
      type: "noop",
    });
  });
});

describe("transitionTimer: Issue #279 の操作制約", () => {
  it("一時停止中の stop は ended へ遷移する", () => {
    expect(
      transitionTimer(paused(42_000, 300_000), { kind: "stop" }, NOW),
    ).toEqual({
      type: "updated",
      timer: { status: "ended", durationMs: 300_000 },
    });
  });

  it("実行中の stop は invalid（実行中の終了操作を公開しない）", () => {
    expect(
      transitionTimer(running(NOW + 1_000, 60_000), { kind: "stop" }, NOW),
    ).toEqual({ type: "invalid" });
  });

  it("ended から start すると再設定した時間で再開できる", () => {
    expect(
      transitionTimer(
        { status: "ended", durationMs: 60_000 },
        { kind: "start", durationMs: 120_000 },
        NOW,
      ),
    ).toEqual({
      type: "updated",
      timer: running(NOW + 120_000, 120_000),
    });
  });

  it("一時停止中・終了後の extend は invalid", () => {
    expect(
      transitionTimer(paused(42_000, 300_000), { kind: "extend" }, NOW),
    ).toEqual({ type: "invalid" });
    expect(
      transitionTimer(
        { status: "ended", durationMs: 300_000 },
        { kind: "extend" },
        NOW,
      ),
    ).toEqual({ type: "invalid" });
  });
});

describe("timerHandlers: alarm の完了待ち", () => {
  it("開始時は setAlarm の完了後に timer:updated を配信する", async () => {
    let resolveAlarm!: () => void;
    const alarm = new Promise<void>((resolve) => {
      resolveAlarm = resolve;
    });
    const setAlarm = vi.fn(() => alarm);
    const { ctx, broadcast } = timerHandlerContext(
      { status: "idle" },
      { setAlarm, deleteAlarm: vi.fn(() => Promise.resolve()) },
    );

    const operation = timerHandlers["timer:start"](ctx, {
      type: "timer:start",
      durationMs: 60_000,
    });
    await Promise.resolve();
    expect(setAlarm).toHaveBeenCalledOnce();
    expect(broadcast).not.toHaveBeenCalled();

    resolveAlarm();
    await operation;
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("一時停止時は deleteAlarm の完了後に timer:updated を配信する", async () => {
    let resolveAlarm!: () => void;
    const alarm = new Promise<void>((resolve) => {
      resolveAlarm = resolve;
    });
    const deleteAlarm = vi.fn(() => alarm);
    const { ctx, broadcast } = timerHandlerContext(
      running(Date.now() + 60_000, 60_000),
      { setAlarm: vi.fn(() => Promise.resolve()), deleteAlarm },
    );

    const operation = timerHandlers["timer:pause"](ctx, {
      type: "timer:pause",
    });
    await Promise.resolve();
    expect(deleteAlarm).toHaveBeenCalledOnce();
    expect(broadcast).not.toHaveBeenCalled();

    resolveAlarm();
    await operation;
    expect(broadcast).toHaveBeenCalledOnce();
  });
});
