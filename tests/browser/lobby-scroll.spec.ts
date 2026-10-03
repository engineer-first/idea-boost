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
  { width: 390, height: 844 },
  { width: 390, height: 640 },
  { width: 844, height: 390 },
])(
  "開始待ちは $width × $height でも上端から開始・解散へ到達できる",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomlobbyview--starting&viewMode=story`,
      );
      const lobby = page.getByTestId("room-lobby-view");
      await lobby.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const heading = page.getByRole("heading", {
        name: "メンバーを集めて開始",
      });
      expect(
        await heading.evaluate((el) => el.getBoundingClientRect().top),
      ).toBeGreaterThanOrEqual(0);
      const invite = await page
        .getByTestId("room-lobby-view-invite")
        .boundingBox();
      expect(
        (invite?.x ?? Infinity) + (invite?.width ?? 0),
      ).toBeLessThanOrEqual(viewport.width);
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 2000);
      await expect
        .poll(() => lobby.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      const leave = page.getByRole("button", {
        name: "ルームを解散",
        exact: true,
      });
      const box = await leave.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(
        viewport.height,
      );
      await leave.click();
      await page.getByRole("alertdialog").waitFor();
      await page.getByRole("button", { name: "キャンセル" }).click();
      await page.keyboard.press("Shift+Tab");
      expect(await page.getByTestId("start-phase-button").isDisabled()).toBe(
        true,
      );
    } finally {
      await page.close();
    }
  },
);
