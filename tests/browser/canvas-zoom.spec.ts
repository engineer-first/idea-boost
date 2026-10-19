import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

test.each([390, 1920])(
  "%ipxで新100%の実寸と選択表示の画面内への収まりを保つ",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--canvas-input-interaction&viewMode=story`,
      );
      await page.getByTestId("board-canvas").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const reset = page.getByRole("button", { name: "ズームを100%に戻す" });
      await reset.click();
      await expect.poll(() => reset.innerText()).toBe("100%");
      const card = page.getByTestId("note-card").first();
      await expect
        .poll(async () => (await card.boundingBox())?.width)
        .toBeCloseTo(150, 0);
      await page
        .getByRole("button", { name: "付箋全体を表示", exact: true })
        .click();
      await card.getByRole("button", { name: "付箋", exact: true }).click();
      await expect.poll(() => card.getAttribute("data-selected")).toBe("true");
      await reset.focus();
      const beforeSelection = await page
        .getByTestId("board-canvas")
        .getAttribute("style");
      await page.keyboard.press("Shift+2");
      await expect
        .poll(() => page.getByTestId("board-canvas").getAttribute("style"))
        .not.toBe(beforeSelection);
      const box = await card.boundingBox();
      if (!box) throw new Error("選択した付箋が見つかりません");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(900);
      expect(await card.getAttribute("data-selected")).toBe("true");
    } finally {
      await page.close();
    }
  },
);
