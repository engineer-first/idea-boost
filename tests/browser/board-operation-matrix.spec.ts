import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 414, height: 635 },
]) {
  test(`${viewport.width}×${viewport.height}: 案内はマイ付箋より下に固定され開閉とスクロールを妨げない`, async () => {
    page = await browser.newPage({ viewport });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-3-step-1&viewMode=story&args=initialGuideState:compact`,
    );
    const matrix = page.getByTestId("board-operation-matrix");
    await matrix.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const before = await matrix.boundingBox();
    const toolbar = page.getByTestId("private-notes-toolbar");
    const bounds = await toolbar.boundingBox();
    expect(before).not.toBeNull();
    expect(bounds).not.toBeNull();
    if (!before || !bounds) throw new Error("案内またはマイ付箋がありません");
    expect(before.x + before.width).toBeGreaterThan(viewport.width / 2);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(before.y);
    const scroll = page.getByRole("region", { name: "マイ付箋一覧" });
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await scroll.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await page.getByRole("button", { name: "マイ付箋を閉じる" }).click();
    expect(await toolbar.getAttribute("data-expanded")).toBe("false");
    expect(await matrix.boundingBox()).toEqual(before);
    await page.getByRole("button", { name: "マイ付箋を開く" }).click();
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    expect(await matrix.boundingBox()).toEqual(before);
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await page
      .getByRole("button", { name: "キャンバスを拡大", exact: true })
      .click();
    const boxes = await page
      .locator(
        '[data-testid="board-operation-matrix"], [data-testid="board-tools-hud"], [data-testid="private-notes-toolbar"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON()),
      );
    for (const box of boxes) {
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      expect(box.bottom).toBeLessThanOrEqual(viewport.height);
      expect(box.top).toBeGreaterThanOrEqual(0);
      for (const other of boxes) {
        if (other === box) continue;
        expect(
          Math.min(box.right, other.right) >
            Math.max(box.left, other.left) + 1 &&
            Math.min(box.bottom, other.bottom) >
              Math.max(box.top, other.top) + 1,
        ).toBe(false);
      }
    }
  });
}
