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

test("外側クリックでルームメニューが閉じ、再表示・Escape・ボードのパンも使える", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-pan-interaction&viewMode=story`,
    );
    const trigger = page.getByRole("button", { name: "ルームメニューを開く" });
    const menu = page.getByRole("dialog", {
      name: "ルームメニュー",
      exact: true,
    });
    await trigger.click();
    await menu.waitFor();
    const box = await menu.boundingBox();
    if (!box) throw new Error("ルームメニューが表示されていません");
    await page.mouse.click(box.x + 5, box.y + 5);
    expect(await menu.isVisible()).toBe(true);
    await page.mouse.click(600, 620);
    await expect.poll(() => menu.isVisible()).toBe(false);
    await trigger.click();
    await menu.waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => menu.isVisible()).toBe(false);
    await expect
      .poll(() => trigger.evaluate((el) => el === document.activeElement))
      .toBe(true);
    await trigger.click();
    await menu.waitFor();
    await trigger.click();
    await expect.poll(() => menu.isVisible()).toBe(false);
    const canvas = page.getByTestId("board-canvas");
    const transform = await canvas.evaluate((el) => el.style.transform);
    await page.mouse.move(600, 620);
    await page.mouse.down();
    await page.mouse.move(680, 660);
    await page.mouse.up();
    await expect
      .poll(() => canvas.evaluate((el) => el.style.transform))
      .not.toBe(transform);
  } finally {
    await page.close();
  }
});
