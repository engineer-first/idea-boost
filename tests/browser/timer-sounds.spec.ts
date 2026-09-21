import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type AudioStartRecord = {
  frequencyHz: number;
  wallTimeMs: number;
  startAt: number;
  stopAt: number | null;
  state: AudioContextState;
};

type AudioProbe = {
  contextStates: AudioContextState[];
  resumeAttempts: number;
  starts: AudioStartRecord[];
};

declare global {
  interface Window {
    __timerAudioProbe?: AudioProbe;
  }
}

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/timer-sounds";
const storyUrl = new URL(
  "/iframe.html?id=room-roomtimer--sound-playground&viewMode=story",
  origin,
).toString();
let browser: Browser;

function installAudioProbe(rejectPlayback: boolean): void {
  const probe: AudioProbe = {
    contextStates: [],
    resumeAttempts: 0,
    starts: [],
  };
  window.__timerAudioProbe = probe;
  const NativeAudioContext = window.AudioContext;
  const prototype = NativeAudioContext.prototype;
  const nativeResume = prototype.resume;
  prototype.resume = function (): Promise<void> {
    probe.resumeAttempts += 1;
    if (rejectPlayback) {
      return Promise.reject(
        new DOMException("Playback was denied", "NotAllowedError"),
      );
    }
    return nativeResume.call(this).then(() => {
      probe.contextStates.push(this.state);
    });
  };

  const nativeCreateOscillator = prototype.createOscillator;
  prototype.createOscillator = function (): OscillatorNode {
    const oscillator = nativeCreateOscillator.call(this);
    const nativeStart = oscillator.start.bind(oscillator);
    const nativeStop = oscillator.stop.bind(oscillator);
    const nativeSetFrequency = oscillator.frequency.setValueAtTime.bind(
      oscillator.frequency,
    );
    let frequencyHz = oscillator.frequency.value;
    oscillator.frequency.setValueAtTime = (value, when) => {
      frequencyHz = value;
      return nativeSetFrequency(value, when);
    };
    let record: AudioStartRecord | undefined;
    oscillator.start = (when?: number) => {
      record = {
        frequencyHz,
        wallTimeMs: performance.now(),
        startAt: when ?? this.currentTime,
        stopAt: null,
        state: this.state,
      };
      probe.starts.push(record);
      nativeStart(when);
    };
    oscillator.stop = (when?: number) => {
      if (record) record.stopAt = when ?? this.currentTime;
      nativeStop(when);
    };
    return oscillator;
  };

  window.AudioContext = class extends NativeAudioContext {
    constructor(options?: AudioContextOptions) {
      super(options);
      if (rejectPlayback) {
        Object.defineProperty(this, "state", {
          configurable: true,
          get: () => "suspended" satisfies AudioContextState,
        });
      }
      probe.contextStates.push(this.state);
    }
  } as typeof AudioContext;
}

async function openStory(page: Page): Promise<void> {
  await page.goto(storyUrl);
  await page.getByTestId("room-timer").waitFor();
  await page.getByTestId("timer-sound-settings").waitFor();
}

async function readAudioProbe(page: Page): Promise<AudioProbe> {
  return page.evaluate(() => {
    if (!window.__timerAudioProbe) {
      throw new Error("Audio probe was not installed");
    }
    return window.__timerAudioProbe;
  });
}

beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(new URL("/index.json", origin));
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1_000 },
  );
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe("RoomTimer の実ブラウザ音声経路", () => {
  it("有効化後に閉じた操作パネルでも開始・5秒予告・時間切れを再生する", async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.addInitScript(installAudioProbe, false);
    try {
      await openStory(page);
      await page.getByTestId("timer-sound-settings").click();
      await page.getByRole("button", { name: "通知音を有効にする" }).click();
      await page.getByRole("button", { name: "通知音を消音" }).waitFor();
      await page.screenshot({ path: join(output, "enabled.png") });

      const enabledProbe = await readAudioProbe(page);
      expect(enabledProbe.contextStates).toContain("running");
      expect(enabledProbe.starts.map(({ frequencyHz }) => frequencyHz)).toEqual(
        [523.25, 659.25],
      );

      await page.getByRole("button", { name: "試聴" }).click();
      await page.waitForFunction(
        () => window.__timerAudioProbe?.starts.length === 4,
      );
      await page.evaluate(() => {
        if (window.__timerAudioProbe)
          window.__timerAudioProbe.starts.length = 0;
      });

      await page.getByTestId("room-timer").click();
      await page.getByLabel("タイマー時間（分）").fill("00");
      await page.getByLabel("タイマー時間（秒）").fill("08");
      await page.getByRole("button", { name: "開始", exact: true }).click();
      await page.getByTestId("room-timer").click();
      await page.getByTestId("room-timer-panel").waitFor({ state: "hidden" });
      expect(
        await page.getByTestId("room-timer").getAttribute("data-status"),
      ).toBe("running");

      try {
        await page.waitForFunction(
          () => window.__timerAudioProbe?.starts.length === 9,
          undefined,
          { timeout: 16_000 },
        );
      } catch (error) {
        const probe = await readAudioProbe(page);
        const status = await page
          .getByTestId("room-timer")
          .getAttribute("data-status");
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; status=${status}; audio=${JSON.stringify(probe)}`,
        );
      }
      expect(
        await page.getByTestId("room-timer").getAttribute("data-status"),
      ).toBe("ended");

      const playback = await readAudioProbe(page);
      expect(playback.contextStates).toContain("running");
      expect(playback.starts.map(({ frequencyHz }) => frequencyHz)).toEqual([
        523.25, 659.25, 880, 880, 880, 880, 880, 392, 329.63,
      ]);
      expect(playback.starts.every(({ state }) => state === "running")).toBe(
        true,
      );
      expect(
        playback.starts.every(
          ({ startAt, stopAt }) => stopAt !== null && stopAt > startAt,
        ),
      ).toBe(true);

      const warningTimes = playback.starts
        .filter(({ frequencyHz }) => frequencyHz === 880)
        .map(({ wallTimeMs }) => wallTimeMs);
      expect(warningTimes).toHaveLength(5);
      for (let index = 1; index < warningTimes.length; index += 1) {
        const interval =
          (warningTimes[index] ?? 0) - (warningTimes[index - 1] ?? 0);
        expect(interval).toBeGreaterThan(700);
        expect(interval).toBeLessThan(1_400);
      }

      const soundDurations = playback.starts.map(
        ({ startAt, stopAt }) =>
          Math.round(((stopAt ?? startAt) - startAt) * 1_000) / 1_000,
      );
      expect(soundDurations).toEqual([
        0.11, 0.13, 0.085, 0.085, 0.085, 0.085, 0.085, 0.17, 0.23,
      ]);
    } finally {
      await context.close();
    }
  }, 25_000);

  it("ブラウザが AudioContext.resume を拒否したとき有効扱いせず案内する", async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.addInitScript(installAudioProbe, true);
    try {
      await openStory(page);
      await page.getByTestId("timer-sound-settings").click();
      await page.getByRole("button", { name: "通知音を有効にする" }).click();
      await page.getByRole("alert").waitFor();
      expect(
        await page.getByRole("button", { name: "通知音を消音" }).count(),
      ).toBe(0);
      expect(
        await page
          .getByRole("button", { name: "再試行して有効にする" })
          .count(),
      ).toBe(1);
      expect((await readAudioProbe(page)).resumeAttempts).toBe(1);
      expect(
        await page.evaluate(() =>
          localStorage.getItem("idea-boost.timer-sounds.enabled.v1"),
        ),
      ).toBeNull();
      await page.screenshot({ path: join(output, "playback-blocked.png") });
    } finally {
      await context.close();
    }
  });
});
