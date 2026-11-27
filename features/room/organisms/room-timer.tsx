"use client";

import { Play, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const t = useTranslations("app.boardTimer");
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
  /** 計時中と停止中は円の下の札に残り時間を出し、未開始と時間切れでは設定時間を出す */
  const showsRemaining =
    !ended && (timer.status === "running" || timer.status === "paused");
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

  const durationLabel =
    locale === "en"
      ? display.durationLabel.replace("分", t("minuteSuffix"))
      : display.durationLabel;
  const timerState = t(
    ended
      ? "statusEnded"
      : timer.status === "idle"
        ? "statusIdle"
        : timer.status === "paused"
          ? "statusPaused"
          : "statusRunning",
  );
  const label = t("label", {
    duration: durationLabel,
    state: timerState,
    time: display.label,
  });

  return (
    <fieldset
      ref={ref}
      className={styles.floating}
      hidden={ended && extensionUsed}
      data-testid="timer-floating"
      data-timer-expanded={expanded}
      data-urgency={display.urgency}
      data-dragging={dragging}
      data-board-native-control
      aria-label={t("instructions")}
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
      {!expanded ? (
        <span
          data-testid="room-timer-crown"
          className={styles.crown}
          aria-hidden="true"
        />
      ) : null}
      {!expanded ? (
        <span
          data-testid="room-timer-duration"
          className={styles.duration}
          aria-hidden="true"
        >
          {showsRemaining ? display.label : durationLabel}
        </span>
      ) : null}
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
            aria-label={`${label}. ${hasActions ? t("openActions") : timer.status === "idle" ? t("startAction") : t("dragAction")}`}
            title={`${label} (${t("dragInstructions")})`}
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
                background: `conic-gradient(from 0deg, var(--ib-color-line) 0deg ${display.elapsedDegrees}deg, ${display.color} ${display.elapsedDegrees}deg 360deg)`,
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
              data-action={paused ? "resume" : "extend"}
              disabled={disabled || (!paused && !onExtend)}
              onClick={(event) => {
                if (event.currentTarget === document.activeElement)
                  focusTarget.current = "circle";
                if (paused) onResume?.();
                else onExtend?.();
              }}
              title={
                paused
                  ? t("resumeFrom", { time: display.label })
                  : t("extendTitle")
              }
            >
              {paused ? <Play aria-hidden="true" /> : null}
              {paused ? t("resume") : t("extend")}
            </button>
          </div>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {paused
          ? t("resumeAnnouncement", { time: display.label })
          : ended
            ? extensionUsed
              ? t("timeUpCheckConditions")
              : t("timeUpExtend")
            : null}
      </span>
    </fieldset>
  );
}
