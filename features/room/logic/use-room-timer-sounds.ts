"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerState } from "@/contracts/room-protocol";

export const ROOM_TIMER_SOUND_STORAGE_KEY =
  "idea-boost.timer-sounds.enabled.v1";

const WARNING_SECONDS = [5, 4, 3, 2, 1] as const;
const WARNING_LATE_TOLERANCE_MS = 250;
const END_LATE_TOLERANCE_MS = 2_000;
const TIMER_SOUND_PEAK_GAIN = 0.04;
const TIMER_SOUND_GAP_SECONDS = 0.05;

type TimerSoundKind = "start" | "warning" | "end";

type TimerSoundTone = {
  frequencyHz: number;
  durationMs: number;
};

const TIMER_SOUND_PATTERNS: Record<TimerSoundKind, readonly TimerSoundTone[]> =
  {
    start: [
      { frequencyHz: 523.25, durationMs: 110 },
      { frequencyHz: 659.25, durationMs: 130 },
    ],
    warning: [{ frequencyHz: 880, durationMs: 85 }],
    end: [
      { frequencyHz: 392, durationMs: 170 },
      { frequencyHz: 329.63, durationMs: 230 },
    ],
  };

export type TimerSoundControls = {
  enabled: boolean;
  playbackBlocked: boolean;
  onEnable: () => Promise<void>;
  onMute: () => void;
  onPreview: () => Promise<void>;
};

type UseRoomTimerSoundsOptions = {
  timer: TimerState;
  serverOffsetMs: number;
  timerUpdateVersion: number;
  now?: () => number;
};

type PreviousTimerEvent = {
  timer: TimerState;
  timerUpdateVersion: number;
};

function getTimerRunKey(timerUpdateVersion: number, endsAt: number): string {
  return `${timerUpdateVersion}:${endsAt}`;
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(ROOM_TIMER_SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSoundPreference(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(ROOM_TIMER_SOUND_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(ROOM_TIMER_SOUND_STORAGE_KEY);
    }
  } catch {
    // 音声設定はこのタブで利用できればよく、保存できない環境でも操作を続ける。
  }
}

function createTimerSound(
  context: AudioContext,
  kind: TimerSoundKind,
  onCreated: (oscillator: OscillatorNode) => void,
  onEnded: (oscillator: OscillatorNode) => void,
): void {
  let startsAt = context.currentTime;
  for (const tone of TIMER_SOUND_PATTERNS[kind]) {
    const endsAt = startsAt + tone.durationMs / 1_000;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tone.frequencyHz, startsAt);
    envelope.gain.setValueAtTime(0, startsAt);
    envelope.gain.linearRampToValueAtTime(
      TIMER_SOUND_PEAK_GAIN,
      startsAt + 0.008,
    );
    envelope.gain.setValueAtTime(TIMER_SOUND_PEAK_GAIN, endsAt - 0.008);
    envelope.gain.linearRampToValueAtTime(0, endsAt);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.onended = () => onEnded(oscillator);
    onCreated(oscillator);
    oscillator.start(startsAt);
    oscillator.stop(endsAt);

    startsAt = endsAt + TIMER_SOUND_GAP_SECONDS;
  }
}

function systemNow(): number {
  return Date.now();
}

export function useRoomTimerSounds({
  timer,
  serverOffsetMs,
  timerUpdateVersion,
  now = systemNow,
}: UseRoomTimerSoundsOptions): TimerSoundControls {
  const [enabled, setEnabled] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const enabledRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef(new Set<OscillatorNode>());
  const firedCueKeysRef = useRef(new Set<string>());
  const armedEndRunKeyRef = useRef<string | null>(null);
  const previousTimerEventRef = useRef<PreviousTimerEvent>({
    timer,
    timerUpdateVersion,
  });

  const setEnabledState = useCallback((nextEnabled: boolean) => {
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
  }, []);

  const stopActiveSounds = useCallback(() => {
    for (const oscillator of activeOscillatorsRef.current) {
      try {
        oscillator.stop();
      } catch {
        // すでに再生を終えた音は停止しなくてよい。
      }
    }
    activeOscillatorsRef.current.clear();
  }, []);

  const blockPlayback = useCallback(() => {
    if (playbackBlockedRef.current) return;
    playbackBlockedRef.current = true;
    setEnabledState(false);
    setPlaybackBlocked(true);
    writeSoundPreference(false);
    stopActiveSounds();
  }, [setEnabledState, stopActiveSounds]);

  const getReadyAudioContext = useCallback(async (): Promise<AudioContext> => {
    let context = audioContextRef.current;
    if (!context || context.state === "closed") {
      if (typeof window.AudioContext !== "function") {
        throw new Error("Web Audio API is not available");
      }
      context = new window.AudioContext();
      audioContextRef.current = context;
    }
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") {
      throw new Error("AudioContext did not start");
    }
    return context;
  }, []);

  const playSound = useCallback(
    (kind: TimerSoundKind) => {
      if (!enabledRef.current) return;
      void getReadyAudioContext()
        .then((context) => {
          if (!enabledRef.current) return;
          createTimerSound(
            context,
            kind,
            (oscillator) => activeOscillatorsRef.current.add(oscillator),
            (oscillator) => activeOscillatorsRef.current.delete(oscillator),
          );
        })
        .catch(blockPlayback);
    },
    [blockPlayback, getReadyAudioContext],
  );

  const playCueOnce = useCallback(
    (key: string, kind: TimerSoundKind) => {
      if (!enabledRef.current || firedCueKeysRef.current.has(key)) return;
      firedCueKeysRef.current.add(key);
      playSound(kind);
    },
    [playSound],
  );

  useEffect(() => {
    if (readSoundPreference()) setEnabledState(true);
  }, [setEnabledState]);

  useEffect(() => {
    const previous = previousTimerEventRef.current;
    const receivedTimerUpdate =
      previous.timerUpdateVersion !== timerUpdateVersion;

    if (receivedTimerUpdate) {
      if (
        timer.status === "running" &&
        (previous.timer.status === "idle" || previous.timer.status === "ended")
      ) {
        playCueOnce(`start:${timerUpdateVersion}:${timer.endsAt}`, "start");
      }

      if (timer.status === "ended" && previous.timer.status === "running") {
        const previousRunKey = getTimerRunKey(
          previous.timerUpdateVersion,
          previous.timer.endsAt,
        );
        const lateByMs = now() + serverOffsetMs - previous.timer.endsAt;
        if (
          armedEndRunKeyRef.current === previousRunKey &&
          lateByMs >= 0 &&
          lateByMs <= END_LATE_TOLERANCE_MS
        ) {
          playCueOnce(`end:${previousRunKey}`, "end");
        }
      }
    }

    previousTimerEventRef.current = { timer, timerUpdateVersion };
    if (timer.status !== "running") armedEndRunKeyRef.current = null;
  }, [playCueOnce, now, serverOffsetMs, timer, timerUpdateVersion]);

  useEffect(() => {
    if (!enabled || timer.status !== "running") {
      armedEndRunKeyRef.current = null;
      return;
    }

    const clientEndsAt = timer.endsAt - serverOffsetMs;
    const scheduledAt = now();
    if (clientEndsAt <= scheduledAt) {
      armedEndRunKeyRef.current = null;
      return;
    }

    const runKey = getTimerRunKey(timerUpdateVersion, timer.endsAt);
    armedEndRunKeyRef.current = runKey;
    const scheduledTimeouts = new Set<number>();

    const scheduleAt = (
      dueAt: number,
      onDue: (lateByMs: number) => void,
    ): void => {
      const timeoutId = window.setTimeout(
        () => {
          scheduledTimeouts.delete(timeoutId);
          if (!enabledRef.current) return;

          const lateByMs = now() - dueAt;
          if (lateByMs < 0) {
            scheduleAt(dueAt, onDue);
          } else {
            onDue(lateByMs);
          }
        },
        Math.max(0, Math.ceil(dueAt - now())),
      );
      scheduledTimeouts.add(timeoutId);
    };

    for (const seconds of WARNING_SECONDS) {
      const dueAt = clientEndsAt - seconds * 1_000;
      if (dueAt <= scheduledAt) continue;
      scheduleAt(dueAt, (lateByMs) => {
        if (lateByMs > WARNING_LATE_TOLERANCE_MS) return;
        playCueOnce(`warning:${runKey}:${seconds}`, "warning");
      });
    }

    return () => {
      for (const timeoutId of scheduledTimeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, now, playCueOnce, serverOffsetMs, timer, timerUpdateVersion]);

  useEffect(
    () => () => {
      stopActiveSounds();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    },
    [stopActiveSounds],
  );

  const onEnable = useCallback(async () => {
    playbackBlockedRef.current = false;
    setPlaybackBlocked(false);
    try {
      const context = await getReadyAudioContext();
      createTimerSound(
        context,
        "start",
        (oscillator) => activeOscillatorsRef.current.add(oscillator),
        (oscillator) => activeOscillatorsRef.current.delete(oscillator),
      );
      setEnabledState(true);
      writeSoundPreference(true);
    } catch {
      blockPlayback();
    }
  }, [blockPlayback, getReadyAudioContext, setEnabledState]);

  const onMute = useCallback(() => {
    setEnabledState(false);
    playbackBlockedRef.current = false;
    setPlaybackBlocked(false);
    writeSoundPreference(false);
    stopActiveSounds();
  }, [setEnabledState, stopActiveSounds]);

  const onPreview = useCallback(async () => {
    if (!enabledRef.current) return;
    try {
      const context = await getReadyAudioContext();
      if (!enabledRef.current) return;
      createTimerSound(
        context,
        "start",
        (oscillator) => activeOscillatorsRef.current.add(oscillator),
        (oscillator) => activeOscillatorsRef.current.delete(oscillator),
      );
    } catch {
      blockPlayback();
    }
  }, [blockPlayback, getReadyAudioContext]);

  return { enabled, playbackBlocked, onEnable, onMute, onPreview };
}
