import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/hmw-hints";
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

for (const width of [1280, 390, 320]) {
  test(`${width}px: 3択と文例を画面内で使い、Escapeでキャラクターへ戻る`, async () => {
    page = await browser.newPage({
      viewport: { width, height: width === 320 ? 568 : 800 },
    });
    page.setDefaultTimeout(5_000);
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-2-step-1&viewMode=story`,
    );
    const trigger = page.getByRole("button", { name: "問いのヒントを開く" });
    await trigger.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const character = await trigger.boundingBox();
    const workspace = await page
      .getByTestId("private-notes-workspace")
      .boundingBox();
    expect(character).not.toBeNull();
    expect(workspace).not.toBeNull();
    expect((workspace?.y ?? 0) + (workspace?.height ?? 0)).toBeLessThanOrEqual(
      character?.y ?? 0,
    );
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "問いのヒント" });
    await dialog.waitFor();
    const words = dialog.getByRole("group", { name: "考え方のワード" });
    expect(await words.getByRole("button").count()).toBe(3);
    await words.getByRole("button", { name: "先回り" }).click();
    const question = dialog.getByRole("textbox", { name: "問いの文例" });
    expect(await question.inputValue()).toContain(
      "チームで何を作るか決めるとき",
    );
    const use = dialog.getByRole("button", { name: "この問いを使う" });
    await use.click({ trial: true });
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.height ?? 0,
    );
    await page.screenshot({ path: `${output}/${width}-question.png` });
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        trigger.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.screenshot({ path: `${output}/${width}-closed.png` });
    await page
      .getByRole("button", { name: "付箋を追加" })
      .click({ trial: true });
  });
}
