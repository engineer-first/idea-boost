"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimerState } from "@/contracts/room-protocol";
import { getRoomTimerDisplay } from "../logic/room-timer-display";
import { useFloatingTimer } from "../logic/use-floating-timer";
import styles from "./room-timer.module.css";

export const TIMER_DEFAULT_DURATION_MS = 3 * 60_000;

export type RoomTimerProps = {
  timer: TimerState;
  serverOffsetMs: number;
  disabled: boolean;
  onStart: (durationMs: number) => void;
  onResume?: () => void;
  onExtend?: () => void;
  now?: () => number;
  initialDurationMs?: number;
};

const systemNow = (): number => Date.now();

export function RoomTimer({
  timer,
  serverOffsetMs,
  disabled,
  onStart,
  onResume,
  onExtend,
  now: getNow = systemNow,
  initialDurationMs = TIMER_DEFAULT_DURATION_MS,
}: RoomTimerProps) {
  const [now, setNow] = useState(getNow);
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLFieldSetElement>(null);
  const circleRef = useRef<HTMLButtonElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<"circle" | "actions" | null>(null);
  const display = getRoomTimerDisplay(
    timer,
    initialDurationMs,
    now + serverOffsetMs,
  );
  const ended = display.ended;
  const paused = timer.status === "paused";
  const extensionUsed = timer.status !== "idle" && !!timer.extensionUsed;
  const hasActions = paused || (ended && !extensionUsed);
  const expanded = hasActions && !collapsed;
  const { dragging, ...floating } = useFloatingTimer(ref, expanded, !paused);

  useEffect(() => {
    if (timer.status !== "running") return;
    const tick = () => setNow(getNow());
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [timer.status, getNow]);
  useEffect(() => {
    if (!hasActions) setCollapsed(false);
  }, [hasActions]);
  useLayoutEffect(() => {
    if (
      !focusTarget.current ||
      (focusTarget.current === "actions") !== expanded
    )
      return;
    const button =
      focusTarget.current === "circle"
        ? circleRef.current
        : primaryActionRef.current;
    if (button) {
      focusTarget.current = null;
      button.focus();
    }
  }, [expanded]);

  const label = `タイマー ${ended ? "終了" : timer.status === "idle" ? "未開始" : timer.status === "paused" ? "一時停止中" : "残り"} ${display.label}`;

  return (
    <fieldset
      ref={ref}
      className={styles.floating}
      hidden={ended && extensionUsed}
      data-testid="timer-floating"
      data-timer-expanded={expanded}
      data-dragging={dragging}
      data-board-native-control
      aria-label="タイマー。Altと矢印キーで移動できます"
      {...floating}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          focusTarget.current = null;
      }}
      onKeyDown={(event) => {
        floating.onKeyDown(event);
        if (event.key === "Escape" && expanded) {
          event.stopPropagation();
          if (event.currentTarget.contains(document.activeElement))
            focusTarget.current = "circle";
          setCollapsed(true);
        }
      }}
    >
      <span className="sr-only" role="timer" aria-label={label}>
        {display.label}
      </span>
      <div className={styles.surface}>
        {!expanded ? (
          <button
            type="button"
            ref={circleRef}
            data-testid="room-timer"
            data-ended={ended}
            data-status={ended ? "ended" : timer.status}
            className={styles.circle}
            disabled={disabled}
            aria-label={`${label}${hasActions ? "。操作を開く" : timer.status === "idle" ? "。規定時間で開始" : "。ドラッグして移動"}`}
            title={`${label}（ドラッグ、またはAltと矢印キーで移動）`}
            onClick={(event) => {
              if (event.currentTarget === document.activeElement && hasActions)
                focusTarget.current = "actions";
              if (hasActions) setCollapsed(false);
              else if (timer.status === "idle") onStart(initialDurationMs);
            }}
          >
            <span
              data-testid="room-timer-disk"
              className={styles.disk}
              style={{
                background: `conic-gradient(from 0deg, #e5e7eb 0deg ${display.elapsedDegrees}deg, ${display.color} ${display.elapsedDegrees}deg 360deg)`,
              }}
              aria-hidden="true"
            />
            {!ended && timer.status !== "idle" ? (
              <span
                data-testid="room-timer-hand"
                className={styles.hand}
                style={{ transform: `rotate(${display.elapsedDegrees}deg)` }}
                aria-hidden="true"
              />
            ) : null}
            {!ended &&
            (timer.status === "idle" || timer.status === "paused") ? (
              <Play className={styles.startIcon} aria-hidden="true" />
            ) : null}
            {ended ? (
              <RotateCcw className={styles.startIcon} aria-hidden="true" />
            ) : null}
          </button>
        ) : (
          <div className={styles.actions} data-testid="room-timer-actions">
            <button
              type="button"
              ref={primaryActionRef}
              disabled={disabled || (!paused && !onExtend)}
              onClick={(event) => {
                if (event.currentTarget === document.activeElement)
                  focusTarget.current = "circle";
                if (paused) onResume?.();
                else onExtend?.();
              }}
              title={
                paused ? `残り${display.label}から再開します` : "1分延長します"
              }
            >
              {paused ? <Play aria-hidden="true" /> : null}
              {paused ? "再開" : "＋1分"}
            </button>
          </div>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {paused
          ? `タイマーを再開すると残り${display.label}から計時します。`
          : ended
            ? extensionUsed
              ? "時間になりました。進行条件を確認してください。"
              : "時間になりました。1分延長できます。"
            : null}
      </span>
    </fieldset>
  );
}
