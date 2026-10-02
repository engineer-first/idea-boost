import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/private-note-layout";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

for (const viewport of [
  { width: 414, height: 635 },
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]) {
  test(`${viewport.width}×${viewport.height}: 展開トレイとヒントをスクロールして操作できる`, async () => {
    page = await browser.newPage({ viewport });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-3-step-1&viewMode=story&args=initialGuideState:compact`,
    );
    await page.getByTestId("board-header-row").waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    ).toEqual(viewport);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    const header = await page.getByTestId("board-header-row").boundingBox();
    const dock = await toolbar.boundingBox();
    if (viewport.width < 640) {
      expect((header?.y ?? 0) + (header?.height ?? 0)).toBeLessThanOrEqual(
        dock?.y ?? 0,
      );
    }
    const help = page.locator("#board-help-content");
    expect(
      await help.evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(48);
    const expand = page.getByRole("tab", { name: "発想を広げる" });
    await expand.click();
    expect(await expand.getAttribute("aria-selected")).toBe("true");
    const write = page.getByRole("tab", { name: "書き出し" });
    await write.focus();
    await page.keyboard.press("Enter");
    expect(await write.getAttribute("aria-selected")).toBe("true");
    await page.getByRole("button", { name: "考えるヒントを閉じる" }).click();
    await page.getByRole("button", { name: "考えるヒントを開く" }).click();
    expect(
      await help.evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(48);
    const note = toolbar
      .getByRole("button", { name: "付箋", exact: true })
      .first();
    await note.scrollIntoViewIfNeeded();
    await note.focus();
    await page.keyboard.press("Enter");
    const editor = toolbar.getByRole("textbox").first();
    expect(await editor.getAttribute("readonly")).toBeNull();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `${output}/${viewport.width}x${viewport.height}-expanded.png`,
    });
    await page.getByRole("button", { name: "マイ付箋を閉じる" }).click();
    expect(await toolbar.getAttribute("data-expanded")).toBe("false");
    await expand.click();
    expect(await expand.getAttribute("aria-selected")).toBe("true");
    await page.screenshot({
      path: `${output}/${viewport.width}x${viewport.height}-collapsed.png`,
    });
  });
}
