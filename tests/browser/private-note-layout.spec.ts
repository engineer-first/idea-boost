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
    if (viewport.width < 640) {
      const reference = page.getByRole("button", { name: "決定した問い" });
      expect(await reference.isVisible()).toBe(true);
      await page.getByRole("button", { name: "考えるヒントを開く" }).click();
      expect(await reference.isVisible()).toBe(false);
      expect(
        await page.getByTestId("board-reference-hmw-content").isVisible(),
      ).toBe(false);
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
    if (viewport.width < 640) {
      expect(
        await page.getByRole("button", { name: "決定した問い" }).isVisible(),
      ).toBe(true);
    }
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
    expect(await note.getAttribute("aria-pressed")).toBe("true");
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

for (const step of [2, 3]) {
  test(`390px・1-${step}: トレイを閉じた上部欄の下の空白でボードを操作できる`, async () => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-1-step-${step}&viewMode=story&args=initialGuideState:compact`,
    );
    const column = page.getByTestId("board-context-column");
    await column.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const close = page.getByRole("button", { name: "マイ付箋を閉じる" });
    if (await close.count()) await close.click();
    const blank = await column.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const contentBottom = Math.max(
        ...Array.from(
          element.children,
          (child) => child.getBoundingClientRect().bottom,
        ),
      );
      return {
        x: bounds.x + 10,
        y: contentBottom + 10,
      };
    });
    // コンテンツの直下が同じ高さの透明な上部欄で覆われない。
    const target = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        blocked: Boolean(
          element?.closest('[data-testid="board-context-column"]'),
        ),
        board: Boolean(element?.closest('[data-testid="board-frame"]')),
      };
    }, blank);
    expect(target).toEqual({ blocked: false, board: true });
  });
}
