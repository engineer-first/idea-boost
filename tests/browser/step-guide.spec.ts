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
