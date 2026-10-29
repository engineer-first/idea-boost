"use client";

import { Pencil, Play, RotateCcw } from "lucide-react";
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
  onReplay?: () => void;
  sharingComplete?: boolean;
  onRestartWriting?: () => void;
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
  onReplay,
  sharingComplete = false,
  onRestartWriting,
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
    sharingComplete
      ? { status: "ended", durationMs: initialDurationMs }
      : timer,
    initialDurationMs,
    now + serverOffsetMs,
  );
  const ended = display.ended || sharingComplete;
  const paused = timer.status === "paused" && !sharingComplete;
  const extensionUsed = timer.status !== "idle" && !!timer.extensionUsed;
  const hasActions = sharingComplete || paused || (ended && !extensionUsed);
  const expanded = hasActions && !collapsed;
  const [attention, setAttention] = useState<"none" | "pulse" | "quiet">(() =>
    ended && !disabled ? "quiet" : "none",
  );
  const previousStatus = useRef({ ended, sharingComplete, disabled });
  const { dragging, ...floating } = useFloatingTimer(
    ref,
    expanded,
    !sharingComplete && !paused,
  );

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
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = { ended, sharingComplete, disabled };
    if (!ended || disabled) setAttention("none");
    else if (previous.disabled) setAttention("quiet");
    else if (!previous.ended || (sharingComplete && !previous.sharingComplete))
      setAttention("pulse");
  }, [ended, sharingComplete, disabled]);
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

  const label = sharingComplete
    ? "共有が一巡しました"
    : `タイマー ${ended ? "終了" : timer.status === "idle" ? "未開始" : timer.status === "paused" ? "一時停止中" : "残り"} ${display.label}`;
  const replay = () => {
    if (disabled) return;
    if (onReplay) onReplay();
    else onStart(initialDurationMs);
  };

  return (
    <fieldset
      ref={ref}
      className={styles.floating}
      hidden={ended && extensionUsed && !sharingComplete}
      data-testid="timer-floating"
      data-timer-expanded={expanded}
      data-timer-attention={
        expanded && sharingComplete && !disabled ? attention : "none"
      }
      data-dragging={dragging}
      data-board-native-control
      aria-label="タイマー。Altと矢印キーで移動できます"
      {...floating}
      onPointerDownCapture={() => setAttention("none")}
      onFocusCapture={() => setAttention("none")}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          focusTarget.current = null;
      }}
      onKeyDown={(event) => {
        setAttention("none");
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
              disabled={disabled || (!paused && !sharingComplete && !onExtend)}
              onClick={(event) => {
                if (event.currentTarget === document.activeElement)
                  focusTarget.current = "circle";
                if (paused) onResume?.();
                else if (sharingComplete) replay();
                else onExtend?.();
              }}
              title={
                paused
                  ? `残り${display.label}から再開します`
                  : sharingComplete
                    ? "共有をもう一巡します"
                    : "1分延長し、終了後に進行条件が揃えば自動で次へ進みます"
              }
            >
              {paused ? (
                <Play aria-hidden="true" />
              ) : sharingComplete ? (
                <RotateCcw aria-hidden="true" />
              ) : null}
              {paused ? "再開" : sharingComplete ? "共有を続ける" : "＋1分"}
            </button>
            {sharingComplete && onRestartWriting ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onRestartWriting}
                title="全員で個人作業へ戻ります。共有済み付箋と下書きは残ります。"
              >
                <Pencil aria-hidden="true" />
                付箋を書き足す
              </button>
            ) : null}
          </div>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {sharingComplete
          ? "全員の共有が一巡しました。共有を続けるか、付箋を書き足すか、みんなに確認して次へ進んでください。"
          : paused
            ? `タイマーを再開すると残り${display.label}から計時します。`
            : ended
              ? extensionUsed
                ? "時間になりました。進行条件を確認してください。"
                : "時間になりました。1分延長できます。延長終了後は、進行条件が揃うと自動で次へ進みます。"
              : null}
      </span>
    </fieldset>
  );
}
