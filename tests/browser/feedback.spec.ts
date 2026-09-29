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
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});
test("狭幅でも5段階をキーボードで選び、種類だけでも送信でき、閉じると入口に戻る", async () => {
  await page.goto(
    `${origin}/iframe.html?id=feedback-feedbackpanel--interactive&viewMode=story`,
  );
  const panel = page.getByRole("dialog", { name: "意見を送る" });
  await panel.waitFor();
  expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  const rating = page.getByRole("radio", { name: "4 使いやすい" });
  await rating.focus();
  await page.keyboard.press("Space");
  expect(await rating.isChecked()).toBe(true);
  await page.keyboard.press("ArrowRight");
  expect(
    await page.getByRole("radio", { name: "5 とても使いやすい" }).isChecked(),
  ).toBe(true);
  await page.getByRole("button", { name: "評価を未回答に戻す" }).click();
  await page.getByText("よかった", { exact: true }).click();
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "意見を受け付けました" })
    .waitFor();
  await page.getByRole("button", { name: "入力欄を閉じる" }).click();
  await page.getByRole("button", { name: "意見を送る", exact: true }).click();
  await panel.waitFor();
  await page.keyboard.press("Escape");
  expect(
    await page
      .getByRole("button", { name: "意見を送る", exact: true })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
});
test("保存結果が先に出て500ms後に案内し、閉じる・再表示・再読込でも案内を重ねない", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--with-feedback&viewMode=story`,
  );
  await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByRole("button", { name: "テキストを保存" }).click();
  expect(await page.getByRole("status").textContent()).toContain(
    "ダウンロードを開始しました",
  );
  expect(
    await page.getByRole("complementary", { name: "感想の案内" }).count(),
  ).toBe(0);
  await page.clock.runFor(499);
  expect(
    await page.getByRole("complementary", { name: "感想の案内" }).count(),
  ).toBe(0);
  await page.clock.runFor(1);
  await page.getByRole("complementary", { name: "感想の案内" }).waitFor();
  expect(
    await page.getByRole("button", { name: "テキストを保存" }).isEnabled(),
  ).toBe(true);
  await page.getByRole("button", { name: "案内を閉じる" }).click();
  await page.getByRole("button", { name: "テキストを保存" }).click();
  await page.clock.runFor(500);
  expect(
    await page.getByRole("complementary", { name: "感想の案内" }).count(),
  ).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "テキストを保存" }).click();
  await page.clock.runFor(500);
  expect(
    await page.getByRole("complementary", { name: "感想の案内" }).count(),
  ).toBe(0);
  await page.getByRole("button", { name: "感想を送る", exact: true }).click();
  expect(await page.getByLabel("対象", { exact: true }).inputValue()).toBe(
    "app",
  );
  await page.clock.resume();
});
test("コピー失敗はエラーを表示して案内せず、操作フォーカスを保持する", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--with-feedback&viewMode=story`,
  );
  await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  await page.evaluate(() => {
    sessionStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.getByRole("button", { name: "全文をコピー" }).click();
  await page.getByRole("alert").waitFor();
  await page.waitForTimeout(600);
  expect(
    await page.getByRole("complementary", { name: "感想の案内" }).count(),
  ).toBe(0);
  expect(
    await page
      .getByRole("button", { name: "全文をコピー" })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
});
test("ボード左上の入口から現行ステップを選んだ入力欄に届く", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--with-feedback&viewMode=story`,
  );
  await page.getByRole("button", { name: "意見を送る", exact: true }).click();
  expect(await page.getByLabel("対象", { exact: true }).inputValue()).toMatch(
    /^[123]-[1-5]$/,
  );
  await page.getByRole("button", { name: "入力欄を閉じる" }).click();
  expect(await page.getByTestId("board-context-hud").isVisible()).toBe(true);
});
