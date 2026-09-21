import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerState } from "@/contracts/room-protocol";
import {
  ROOM_TIMER_SOUND_STORAGE_KEY,
  useRoomTimerSounds,
} from "./use-room-timer-sounds";

type StartedTone = {
  frequencyHz: number;
  startsAt: number;
  stopsAt: number | null;
};

const startedTones: StartedTone[] = [];
const audioContexts: FakeAudioContext[] = [];
let nowMs = 1_720_000_000_000;
let rejectResume = false;

class FakeAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = {} as AudioDestinationNode;

  constructor() {
    audioContexts.push(this);
  }

  async resume(): Promise<void> {
    if (rejectResume) {
      throw new DOMException("Playback was denied", "NotAllowedError");
    }
    this.state = "running";
  }

  async close(): Promise<void> {
    this.state = "closed";
  }

  createGain(): GainNode {
    const gain = {
      value: 0,
      setValueAtTime(value: number) {
        this.value = value;
      },
      linearRampToValueAtTime(value: number) {
        this.value = value;
      },
    };
    return {
      gain,
      connect: vi.fn(),
    } as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const frequency = {
      value: 0,
      setValueAtTime(value: number) {
        this.value = value;
      },
    };
    let recordedTone: StartedTone | undefined;
    return {
      type: "sine",
      frequency,
      connect: vi.fn(),
      start: vi.fn((startsAt = 0) => {
        recordedTone = {
          frequencyHz: frequency.value,
          startsAt,
          stopsAt: null,
        };
        startedTones.push(recordedTone);
      }),
      stop: vi.fn((stopsAt = 0) => {
        if (recordedTone) recordedTone.stopsAt = stopsAt;
      }),
      onended: null,
    } as unknown as OscillatorNode;
  }
}

const activeSound = (
  endsAt: number,
  durationMs = endsAt - nowMs,
): TimerState => ({
  status: "running",
  endsAt,
  durationMs,
});

function setup(timer: TimerState, timerUpdateVersion = 0, serverOffsetMs = 0) {
  return renderHook(
    (props: {
      timer: TimerState;
      timerUpdateVersion: number;
      serverOffsetMs: number;
    }) =>
      useRoomTimerSounds({
        ...props,
        now: () => nowMs,
      }),
    {
      initialProps: { timer, timerUpdateVersion, serverOffsetMs },
    },
  );
}

async function enableAndClearPreview(result: {
  current: ReturnType<typeof useRoomTimerSounds>;
}): Promise<void> {
  await act(async () => {
    await result.current.onEnable();
  });
  startedTones.length = 0;
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    nowMs += milliseconds;
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function rerenderTimer(
  rerender: (props: {
    timer: TimerState;
    timerUpdateVersion: number;
    serverOffsetMs: number;
  }) => void,
  timer: TimerState,
  timerUpdateVersion: number,
  serverOffsetMs = 0,
): Promise<void> {
  await act(async () => {
    rerender({ timer, timerUpdateVersion, serverOffsetMs });
    await Promise.resolve();
  });
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
  nowMs = 1_720_000_000_000;
  rejectResume = false;
  startedTones.length = 0;
  audioContexts.length = 0;
  localStorage.clear();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: FakeAudioContext,
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useRoomTimerSounds", () => {
  it("snapshot の開始音は再生せず、timer:updated の新規開始だけ開始音を鳴らす", async () => {
    const initialTimer = activeSound(nowMs + 10_000);
    const snapshot = setup(initialTimer);
    await enableAndClearPreview(snapshot.result);

    await rerenderTimer(snapshot.rerender, initialTimer, 0, 120);
    expect(startedTones).toHaveLength(0);
    snapshot.unmount();

    const freshRoom = setup({ status: "idle" });
    await enableAndClearPreview(freshRoom.result);
    await rerenderTimer(freshRoom.rerender, initialTimer, 1, 120);
    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([
      523.25, 659.25,
    ]);
  });

  it("終了後に timer:updated で再スタートしたときも開始音を鳴らす", async () => {
    const ended: TimerState = { status: "ended", durationMs: 10_000 };
    const { result, rerender } = setup(ended);
    await enableAndClearPreview(result);

    await rerenderTimer(rerender, activeSound(nowMs + 10_000), 1);

    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([
      523.25, 659.25,
    ]);
  });

  it("開始後の5・4・3・2・1秒は1回ずつ鳴り、時間切れは別の音になる", async () => {
    const durationMs = 6_000;
    const initialTimer = activeSound(nowMs + durationMs, durationMs);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);

    for (const warningSeconds of [5, 4, 3, 2, 1]) {
      await advance(1_000);
      expect(startedTones).toHaveLength(6 - warningSeconds);
      expect(startedTones.at(-1)?.frequencyHz).toBe(880);
    }

    await advance(1_000);
    await rerenderTimer(rerender, { status: "ended", durationMs }, 1);
    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([
      880, 880, 880, 880, 880, 392, 329.63,
    ]);
    expect(
      startedTones.every(
        ({ stopsAt, startsAt }) => stopsAt !== null && stopsAt > startsAt,
      ),
    ).toBe(true);
  });

  it("途中参加と再接続では過去音を鳴らさず、参加後の予告だけを予約する", async () => {
    const initialTimer = activeSound(nowMs + 6_000, 6_000);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);

    await rerenderTimer(rerender, initialTimer, 0, 80);
    expect(startedTones).toHaveLength(0);
    await advance(1_000);
    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([880]);

    const endedSnapshot = setup({ status: "ended", durationMs: 6_000 });
    await enableAndClearPreview(endedSnapshot.result);
    expect(startedTones).toHaveLength(0);
    endedSnapshot.unmount();
  });

  it("期限を過ぎたスナップショットでは終了音を後追い再生しない", async () => {
    const expiredSnapshot = activeSound(nowMs - 500, 6_000);
    const { result, rerender } = setup(expiredSnapshot);
    await enableAndClearPreview(result);

    await rerenderTimer(rerender, { status: "ended", durationMs: 6_000 }, 1);
    expect(startedTones).toHaveLength(0);
  });

  it("一時停止と手動終了は予約を取り消し、再開音と終了音を鳴らさない", async () => {
    const durationMs = 8_000;
    const initialTimer = activeSound(nowMs + durationMs, durationMs);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);

    await advance(1_000);
    const paused: TimerState = {
      status: "paused",
      remainingMs: durationMs - 1_000,
      durationMs,
    };
    await rerenderTimer(rerender, paused, 1);
    const countAtPause = startedTones.length;
    await advance(5_000);
    expect(startedTones).toHaveLength(countAtPause);

    await rerenderTimer(rerender, activeSound(nowMs + 2_000, 2_000), 2);
    expect(startedTones).toHaveLength(countAtPause);
    await rerenderTimer(rerender, paused, 3);
    await rerenderTimer(rerender, { status: "ended", durationMs }, 4);
    expect(startedTones).toHaveLength(countAtPause);
  });

  it("延長は元の予告を止め、新しい終了時刻に沿って再予約する", async () => {
    const initialTimer = activeSound(nowMs + 6_000, 6_000);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);

    const extended = activeSound(nowMs + 66_000, 66_000);
    await rerenderTimer(rerender, extended, 1);
    await advance(6_000);
    expect(startedTones).toHaveLength(0);

    await advance(55_000);
    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([880]);
  });

  it("手動ステップ移行の idle 更新で時間切れ音を鳴らさない", async () => {
    const initialTimer = activeSound(nowMs + 8_000, 8_000);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);

    await rerenderTimer(rerender, { status: "idle" }, 1);
    await advance(10_000);
    expect(startedTones).toHaveLength(0);
  });

  it("同じ時間切れを重複再生しない", async () => {
    const durationMs = 1_000;
    const initialTimer = activeSound(nowMs + durationMs, durationMs);
    const { result, rerender } = setup(initialTimer);
    await enableAndClearPreview(result);
    await advance(durationMs);

    const ended: TimerState = { status: "ended", durationMs };
    await rerenderTimer(rerender, ended, 1);
    const countAfterEnd = startedTones.length;
    await rerenderTimer(rerender, ended, 2);
    expect(countAfterEnd).toBe(2);
    expect(startedTones).toHaveLength(countAfterEnd);
  });

  it("遅れた予告をまとめて鳴らさず、遅延幅内の直近の予告だけを鳴らす", async () => {
    const initialTimer = activeSound(nowMs + 7_000, 7_000);
    const { result } = setup(initialTimer);
    await enableAndClearPreview(result);

    await advance(5_000);
    expect(startedTones.map(({ frequencyHz }) => frequencyHz)).toEqual([880]);
  });

  it("再生を拒否されたら有効化せず、再試行案内を出せる状態にする", async () => {
    rejectResume = true;
    const { result } = setup({ status: "idle" });

    await act(async () => {
      await result.current.onEnable();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.playbackBlocked).toBe(true);
    expect(localStorage.getItem(ROOM_TIMER_SOUND_STORAGE_KEY)).toBeNull();
  });

  it("端末設定の有効化・消音はローカル保存だけで切り替わる", async () => {
    const { result } = setup({ status: "idle" });
    await act(async () => {
      await result.current.onEnable();
    });
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem(ROOM_TIMER_SOUND_STORAGE_KEY)).toBe("true");

    act(() => result.current.onMute());
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem(ROOM_TIMER_SOUND_STORAGE_KEY)).toBeNull();
  });
});
