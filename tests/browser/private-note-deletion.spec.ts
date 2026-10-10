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

test.each([
  390, 1280,
])("%ipx: 個人付箋をMacのDeleteキー単体で削除し、編集中は文字だけを削除する", async (width) => {
  page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--step-1-1-personal-writing&viewMode=story`,
  );
  const cards = page
    .getByTestId("private-notes-toolbar")
    .getByTestId("note-card");
  await cards.first().waitFor();
  const first = cards.first();
  const deletedId = await first.getAttribute("data-note-id");
  await first.getByRole("button", { name: "付箋", exact: true }).click();
  await page.keyboard.press("Backspace");

  await expect.poll(() => cards.count()).toBe(1);
  expect(await cards.first().getAttribute("data-note-id")).not.toBe(deletedId);
  const surface = cards
    .first()
    .getByRole("button", { name: "付箋", exact: true });
  await expect
    .poll(() =>
      surface.evaluate((element) => element === document.activeElement),
    )
    .toBe(true);

  // 削除で移ったfocusだけでは次の付箋を削除せず、選択する。
  await page.keyboard.press("Backspace");
  expect(await cards.count()).toBe(1);
  await page.keyboard.press("Enter");
  const editor = cards.first().getByRole("textbox");
  const original = await editor.inputValue();
  await page.keyboard.insertText("x");
  await page.keyboard.press("Backspace");
  expect(await editor.inputValue()).toBe(original);
  expect(await cards.count()).toBe(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await expect.poll(() => cards.count()).toBe(0);
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "付箋を追加" })
        .evaluate((element) => element === document.activeElement),
    )
    .toBe(true);
});
