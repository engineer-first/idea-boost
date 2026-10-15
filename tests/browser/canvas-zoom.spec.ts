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

test.each([
  390, 1280, 1920,
])("%ipxで倍率入力・Escape・選択表示を操作できる", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardview--canvas-input-interaction&viewMode=story`,
    );
    await page.getByTestId("board-canvas").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const trigger = page.getByRole("button", { name: "ズーム倍率を変更" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "キャンバスのズーム" });
    const bounds = await dialog.boundingBox();
    if (!bounds) throw new Error("倍率メニューが表示されません");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    await page.getByRole("textbox", { name: "ズーム倍率（%）" }).fill("100");
    await page.keyboard.press("Enter");
    await expect.poll(() => trigger.innerText()).toBe("100%");
    const card = page.getByTestId("note-card").first();
    await expect
      .poll(async () => (await card.boundingBox())?.width)
      .toBeCloseTo(150, 0);
    await trigger.click();
    await page.getByRole("textbox", { name: "ズーム倍率（%）" }).fill("200");
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog.count()).toBe(0);
    await expect
      .poll(() =>
        trigger.evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
    expect(await trigger.innerText()).toBe("100%");
    // 初期fitへ戻してから、画面内の付箋を選ぶ。
    await page
      .getByRole("button", { name: "付箋全体を表示", exact: true })
      .click();
    await card.getByRole("button", { name: "付箋", exact: true }).click();
    await expect.poll(() => card.getAttribute("data-selected")).toBe("true");
    await trigger.click();
    const selection = page.getByRole("button", { name: /選択した付箋を表示/ });
    expect(await selection.isEnabled()).toBe(true);
    await selection.click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(await card.getAttribute("data-selected")).toBe("true");
    const box = await card.boundingBox();
    if (!box) throw new Error("選択した付箋が見つかりません");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(900);
    // HUDからのキー操作も同じ100%基準を使う。
    await trigger.focus();
    await page.keyboard.press("Shift+0");
    await expect.poll(() => trigger.innerText()).toBe("100%");
    await page.keyboard.press("+");
    await expect.poll(() => trigger.innerText()).toBe("125%");
  } finally {
    await page.close();
  }
});
