import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { flowOpener, stepGuideOpener } from "./step-guide-opener";
import { checksWidth, widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each(
  (
    [
      [1280, 720, 1, 1],
      [1280, 720, 1, 2],
      [1280, 720, 1, 3],
      [1280, 720, 1, 4],
      [1280, 720, 1, 5],
      [1280, 720, 2, 1],
      [1280, 720, 3, 1],
      [1280, 720, 3, 3],
      [390, 844, 1, 1],
      [390, 844, 1, 2],
      [390, 844, 1, 3],
      [390, 844, 1, 4],
      [390, 844, 1, 5],
      [390, 844, 2, 1],
      [390, 844, 3, 1],
      [390, 844, 3, 3],
    ] as const
  ).filter(([width]) => checksWidth(width)),
)(
  "%i×%iの工程%i-%iで全スライド・図解・閉じる操作に到達し、閉じた後もボードを操作できる",
  async (width, height, phase, step) => {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
      );
      const guide = stepGuideOpener(page, width);
      await guide.waitFor();
      expect(await page.getByRole("dialog").count()).toBe(0);
      const canvas = page.getByTestId("board-canvas");
      const camera = await canvas.getAttribute("style");
      await guide.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const slideCount = phase === 1 && step === 1 ? 3 : 2;
      for (let index = 0; index < slideCount; index++) {
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
          name: index === slideCount - 1 ? "はじめる" : "次へ",
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
      await flowOpener(page, width).click();
      expect(await page.getByRole("tab", { name: /問い/ }).isVisible()).toBe(
        true,
      );
    } finally {
      await page.close();
    }
  },
);

test.each(widths(390, 1280))(
  "幅%iで進め方が参加者と進行の操作を遮らない",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-activeroomflow--success&viewMode=story`,
      );
      const members = page.getByRole("button", {
        name: "参加者 2人",
        exact: true,
      });
      await members.waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const target of [
        members,
        page.getByRole("button", { name: "できた！", exact: true }),
        stepGuideOpener(page, width),
      ]) {
        await target.scrollIntoViewIfNeeded();
        expect(
          await target.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              ),
            );
          }),
        ).toBe(true);
      }
      await members.click();
      await page
        .getByRole("button", { name: "Hana Sato", exact: true })
        .waitFor();
    } finally {
      await page.close();
    }
  },
);
