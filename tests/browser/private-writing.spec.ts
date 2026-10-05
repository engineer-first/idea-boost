import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage();
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});
async function openDelayedAddition(width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(
    `${origin}/iframe.html?id=notes-privatenotestoolbar--delayed-addition&viewMode=story`,
  );
  await page.getByTestId("private-notes-toolbar").waitFor();
}

for (const width of [390, 1440]) {
  test(`追加応答を待つ間の既存下書きの入力・選択・スクロールを維持する (${width}px)`, async () => {
    await openDelayedAddition(width);
    const oldNote = page.locator('[data-note-id="single-note"]');
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    await oldNote
      .getByRole("button", { name: "付箋", exact: true })
      .press("Enter");
    expect(await oldNote.getAttribute("data-selected")).toBe("true");
    await oldNote
      .getByRole("button", { name: "付箋", exact: true })
      .press("Enter");
    const editor = oldNote.locator("textarea");
    await editor.fill("入力中の下書き");
    const scrollBefore = await page
      .getByTestId("private-notes-scroll")
      .evaluate((element) => element.scrollTop);
    await page.locator('[data-note-id="delayed-new-note"]').waitFor();
    // 追加によるpassive effectが済んだ後も、次のキー入力が既存本文へ届く。
    await page.waitForTimeout(250);
    expect(
      await editor.evaluate((element) => document.activeElement === element),
    ).toBe(true);
    await page.keyboard.type(" + continued");
    expect(await editor.inputValue()).toBe("入力中の下書き + continued");
    expect(
      await page
        .getByTestId("private-notes-scroll")
        .evaluate((element) => element.scrollTop),
    ).toBe(scrollBefore);
    expect(
      await page
        .locator('[data-note-id="delayed-new-note"] textarea')
        .getAttribute("readonly"),
    ).not.toBeNull();
  });

  test(`既存の入力に戻らなければ新しい付箋ですぐ入力できる (${width}px)`, async () => {
    await openDelayedAddition(width);
    await page.getByRole("button", { name: "付箋を追加", exact: true }).click();
    const editor = page.locator(
      '[data-note-id="delayed-new-note"] textarea:not([readonly])',
    );
    await editor.waitFor();
    expect(
      await editor.evaluate((element) => document.activeElement === element),
    ).toBe(true);
    await page.keyboard.type("new draft");
    expect(await editor.inputValue()).toBe("new draft");
  });
}
