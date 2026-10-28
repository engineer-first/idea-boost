import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each([
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [3, 3],
])(
  "%i-%iの実操作動画が読み込まれ、固定枠で音なし再生できる",
  async (phase, step) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
      );
      await page.getByRole("button", { name: "進め方", exact: true }).click();
      const before = await page.getByRole("dialog").boundingBox();
      await page.getByRole("button", { name: "次へ", exact: true }).click();
      await page
        .getByRole("button", { name: "はじめる", exact: true })
        .waitFor();
      const video = page.getByRole("dialog").locator("video");
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.readyState),
        )
        .toBeGreaterThanOrEqual(2);
      expect(
        await video.evaluate((element: HTMLVideoElement) => ({
          muted: element.muted,
          loop: element.loop,
          width: element.videoWidth,
          height: element.videoHeight,
        })),
      ).toMatchObject({ muted: true, loop: true });
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.currentTime),
        )
        .toBeGreaterThan(0);
      const fitting = await video.evaluate((element: HTMLVideoElement) => {
        const box = element.getBoundingClientRect();
        return (
          Math.min(
            box.width,
            (box.height * element.videoWidth) / element.videoHeight,
          ) / box.width
        );
      });
      expect(fitting).toBeGreaterThan(0.97);
      expect(await page.getByRole("dialog").boundingBox()).toEqual(before);
    } finally {
      await page.close();
    }
  },
);

test("通常の動きで次へ押下後も内容を白く消さず、図と説明の比率・ダイアログ寸法を保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-1-step-2&viewMode=story`,
    );
    await page.getByRole("button", { name: "進め方", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const before = await dialog.boundingBox();
    const frames = await dialog.evaluate(async (element) => {
      const samples: { opacity: number; width: number; height: number }[] = [];
      const content = element.querySelector(
        '[data-testid="step-one-onboarding-slide-content"]',
      );
      const next = Array.from(element.querySelectorAll("button")).find(
        (button) => button.textContent === "次へ",
      );
      next?.click();
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const sample = () => {
          const rect = element.getBoundingClientRect();
          samples.push({
            opacity: Number(getComputedStyle(content as Element).opacity),
            width: rect.width,
            height: rect.height,
          });
          if (performance.now() - start < 650) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return samples;
    });
    expect(
      Math.min(...frames.map((frame) => frame.opacity)),
    ).toBeGreaterThanOrEqual(0.99);
    expect(before?.width).toBeLessThanOrEqual(768);
    expect(
      Math.max(...frames.map((frame) => frame.height)) -
        Math.min(...frames.map((frame) => frame.height)),
    ).toBeLessThan(1);
    expect(await dialog.boundingBox()).toEqual(before);
    await dialog.getByRole("button", { name: "1枚目に戻る" }).click();
    await page
      .getByRole("dialog", {
        name: "自分の困りごとを共有し、みんなの困りごとを知ろう。",
      })
      .waitFor();
    expect(await dialog.boundingBox()).toEqual(before);
  } finally {
    await page.close();
  }
});

test("工程や原稿量が違ってもデスクトップの図・説明・操作の位置と縦横比を保つ", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  try {
    let expected:
      | { width: number; height: number; figureHeight: number; footerY: number }
      | undefined;
    for (const [phase, step] of [
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 1],
      [3, 3],
    ]) {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
      );
      await page.getByRole("button", { name: "進め方", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "次へ" }).click();
      await dialog.getByRole("button", { name: "はじめる" }).waitFor();
      const dimensions = await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const figure = element.querySelector("figure")?.getBoundingClientRect();
        const footer = Array.from(element.querySelectorAll("button"))
          .find((button) => button.textContent === "はじめる")
          ?.getBoundingClientRect();
        const diagram = element
          .querySelector("figure section, figure video")
          ?.getBoundingClientRect();
        if (
          !figure ||
          !diagram ||
          diagram.top < figure.top - 1 ||
          diagram.bottom > figure.bottom + 1
        ) {
          throw new Error("図全体が図解枠の中に収まっていません");
        }
        return {
          width: bounds.width,
          height: bounds.height,
          figureHeight: figure?.height ?? 0,
          footerY: footer?.y ?? 0,
        };
      });
      expected ??= dimensions;
      expect(dimensions).toEqual(expected);
      expect(dimensions.width).toBeLessThanOrEqual(768);
      expect(dimensions.width / dimensions.height).toBeCloseTo(1.4, 2);
    }
  } finally {
    await page.close();
  }
});

test.each([
  [1280, 720],
  [390, 844],
  [320, 568],
])(
  "%i×%iで対象工程の全スライド・図解・閉じる操作に到達し、閉じた後もボードを操作できる",
  async (width, height) => {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(5000);
    try {
      for (const [phase, step] of [
        [1, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
        [2, 1],
        [3, 1],
        [3, 3],
      ]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
        );
        const guide = page.getByRole("button", { name: "進め方" });
        await guide.waitFor();
        expect(await page.getByRole("dialog").count()).toBe(0);
        const canvas = page.getByTestId("board-canvas");
        const camera = await canvas.getAttribute("style");
        await guide.click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        for (
          let index = 0;
          index < (phase === 1 && step === 1 ? 4 : 2);
          index++
        ) {
          const heading = dialog.getByRole("heading");
          await heading.scrollIntoViewIfNeeded();
          expect((await heading.boundingBox())?.x).toBeGreaterThanOrEqual(0);
          expect(
            await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          const figure = dialog.locator("figure");
          await figure.scrollIntoViewIfNeeded();
          expect((await figure.boundingBox())?.width).toBeLessThan(width);
          const action = dialog.getByRole("button", {
            name:
              index === (phase === 1 && step === 1 ? 3 : 1)
                ? "はじめる"
                : "次へ",
          });
          await action.click();
          if (await dialog.count()) {
            await expect
              .poll(() =>
                page
                  .getByTestId("step-one-onboarding-slide-content")
                  .getAttribute("data-slide-transition"),
              )
              .toBe("idle");
          }
        }
        await dialog.waitFor({ state: "hidden" });
        expect(await canvas.getAttribute("style")).toBe(camera);
        await guide.click();
        await dialog.getByRole("button", { name: "閉じる" }).click();
        await dialog.waitFor({ state: "hidden" });
        await guide.click();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.getByTestId("board-location-trigger").click();
        expect(await page.getByRole("tab", { name: /問い/ }).isVisible()).toBe(
          true,
        );
      }
    } finally {
      await page.close();
    }
  },
);
