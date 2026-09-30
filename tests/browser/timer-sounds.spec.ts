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
  rejectPlayback: boolean;
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
    rejectPlayback,
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
    if (probe.rejectPlayback) {
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
          get: () =>
            probe.rejectPlayback
              ? ("suspended" satisfies AudioContextState)
              : (Reflect.get(prototype, "state", this) as AudioContextState),
        });
      }
      probe.contextStates.push(this.state);
    }
  } as typeof AudioContext;
}

async function openStory(page: Page): Promise<void> {
  await page.goto(storyUrl);
  await page.getByTestId("room-timer").waitFor();
  await page.getByTestId("timer-sound-toggle").waitFor();
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
  it("パネル表示中も音の1クリックが届き、一時停止後のEnterは終了しない", async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await openStory(page);
      await page.getByTestId("room-timer").click();
      await page.getByTestId("timer-sound-toggle").click();
      await vi.waitFor(async () => {
        expect(
          await page
            .getByTestId("timer-sound-toggle")
            .getAttribute("aria-pressed"),
        ).toBe("true");
      });
      expect(await page.getByTestId("room-timer-panel").isVisible()).toBe(true);
      await page.getByRole("button", { name: "開始", exact: true }).click();
      const pause = page.getByRole("button", { name: "一時停止", exact: true });
      await pause.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="room-timer"]')
            ?.getAttribute("data-status") === "paused",
      );
      expect(
        await page
          .getByTestId("room-timer")
          .evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Enter");
      expect(
        await page.getByTestId("room-timer").getAttribute("data-status"),
      ).toBe("paused");
      await page.getByTestId("room-timer-panel").waitFor({ state: "hidden" });
    } finally {
      await context.close();
    }
  });

  it("アイコンで有効化すると確認音を鳴らし、開始・5秒予告・時間切れを再生する", async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.addInitScript(installAudioProbe, false);
    try {
      await openStory(page);
      const soundToggle = page.getByTestId("timer-sound-toggle");
      await soundToggle.click();
      await vi.waitFor(async () => {
        expect(await soundToggle.getAttribute("aria-pressed")).toBe("true");
      });
      await page.screenshot({ path: join(output, "enabled.png") });

      const enabledProbe = await readAudioProbe(page);
      expect(enabledProbe.contextStates).toContain("running");
      expect(enabledProbe.starts.map(({ frequencyHz }) => frequencyHz)).toEqual(
        [523.25, 659.25],
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

  it("再生拒否を表示し、キーボードで再試行すると実音声経路を有効化する", async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.addInitScript(installAudioProbe, true);
    try {
      await openStory(page);
      const soundToggle = page.getByTestId("timer-sound-toggle");
      await soundToggle.click();
      await vi.waitFor(async () => {
        expect(await soundToggle.getAttribute("aria-pressed")).toBe("false");
        expect(await soundToggle.getAttribute("title")).toContain(
          "通知音を再生できません",
        );
      });
      expect(await page.getByRole("dialog").count()).toBe(0);
      expect((await readAudioProbe(page)).resumeAttempts).toBe(1);
      expect(
        await page.evaluate(() =>
          localStorage.getItem("idea-boost.timer-sounds.enabled.v1"),
        ),
      ).toBeNull();
      const status = page.getByRole("status");
      await status.waitFor();
      expect(await status.innerText()).toContain("再試行");
      const bounds = await status.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
      const background = await status.evaluate(
        (element) =>
          getComputedStyle(
            element.closest("[data-slot=tooltip-content]") ?? element,
          ).backgroundColor,
      );
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      await page.screenshot({ path: join(output, "playback-blocked.png") });

      await page.evaluate(() => {
        if (window.__timerAudioProbe)
          window.__timerAudioProbe.rejectPlayback = false;
      });
      await soundToggle.focus();
      await page.keyboard.press("Space");
      await vi.waitFor(async () => {
        expect(await soundToggle.getAttribute("aria-pressed")).toBe("true");
      });
      await page.getByRole("status").waitFor({ state: "hidden" });
      const retried = await readAudioProbe(page);
      expect(retried.starts).toHaveLength(2);
      expect(retried.starts.every(({ state }) => state === "running")).toBe(
        true,
      );
      await soundToggle.press("Space");
      expect(await soundToggle.getAttribute("aria-pressed")).toBe("false");
    } finally {
      await context.close();
    }
  });
});
