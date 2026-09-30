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

for (const width of [390, 1440]) {
  test(`長文をコピーし、復旧UIを閉じて再表示できる (${width}px)`, async () => {
    await page.setViewportSize({ width, height: 844 });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(
      `${origin}/iframe.html?id=notes-notedraftrecovery--multiple-long-drafts&viewMode=story`,
    );
    await page.getByRole("button", { name: "確認・コピー" }).click();
    const second = page.getByRole("textbox", {
      name: "未反映の文章 2",
      exact: true,
    });
    await second.scrollIntoViewIfNeeded();
    const text = await second.inputValue();
    const copy = page
      .getByRole("button", { name: "コピー", exact: true })
      .nth(1);
    await copy.click();
    await page.getByRole("status", { name: "コピー結果" }).waitFor();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      text,
    );
    const box = await copy.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    expect(await page.getByRole("textbox").count()).toBe(0);
    await page.getByRole("button", { name: "確認・コピー" }).press("Enter");
    expect(await second.inputValue()).toBe(text);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test("クリップボード拒否時は全文を選択して手動回収できる", async () => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
  });
  await page.goto(
    `${origin}/iframe.html?id=notes-notedraftrecovery--conflict&viewMode=story`,
  );
  await page.getByRole("button", { name: "確認・コピー" }).click();
  await page.getByRole("button", { name: "コピー", exact: true }).click();
  await page.getByRole("alert").waitFor();
  expect(await page.getByRole("status", { name: "コピー結果" }).count()).toBe(
    0,
  );
  const text = page.getByRole("textbox", { name: "未反映の文章 1" });
  await text.focus();
  expect(
    await text.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd - element.selectionStart,
    ),
  ).toBe((await text.inputValue()).length);
});
