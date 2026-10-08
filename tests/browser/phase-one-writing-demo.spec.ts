import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});

test("フェーズ1-1のデモは付箋追加と入力の2ステップだけを案内する", async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--phase-one-writing-demo&viewMode=story`,
  );

  const body = page.locator("body");
  await expect(
    body.getByText("このボタンで付箋を追加します。", { exact: true }),
  ).toBeVisible();
  expect(await body.getByRole("button", { name: "付箋を追加" }).count()).toBe(
    1,
  );
  await body.getByRole("button", { name: "次へ" }).click();

  await expect
    .poll(
      () =>
        body
          .getByText("最近困ったことを書き出しましょう。", { exact: true })
          .count(),
      {
        timeout: 8_000,
      },
    )
    .toBe(1);
  expect(await body.locator('[data-tour="phase-one-demo-note"]').count()).toBe(
    1,
  );
  expect(
    await body.getByRole("textbox", { name: "デモの付箋" }).inputValue(),
  ).toBe("会議で発言するタイミングがわからない");

  await body.getByRole("button", { name: "終了" }).click();
  expect(await body.getByTestId("phase-one-writing-tour").count()).toBe(0);

  expect(
    await body.getByText("保存ボタンは不要です。", { exact: true }).count(),
  ).toBe(0);
});
