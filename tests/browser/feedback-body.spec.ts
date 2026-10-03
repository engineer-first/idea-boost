import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});
async function openFeedback(page: Page): Promise<void> {
  page.setDefaultTimeout(5000);
  await page.goto(
    `${origin}/iframe.html?id=feedback-feedbackpanel--submission-contents&viewMode=story`,
  );
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  await page.getByText("不具合", { exact: true }).click();
}

// 実際のフォーム操作と送信callbackまでを検査する。保存先はStoryのモック。
test.each([
  "click",
  "keyboard",
])("%sで入力直後に送っても日本語・改行・絵文字を保持する", async (method) => {
  const dir = "test-results/board-layout/feedback-text";
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(method === "click"
      ? { recordVideo: { dir, size: { width: 1280, height: 900 } } }
      : {}),
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await openFeedback(page);
    const body = "日本語の意見です。\n改行・絵文字🙂・記号<&>も残す";
    await page.getByLabel("文章（任意）").fill(body);
    if (method === "click")
      await page.screenshot({ path: `${dir}/before-submit.png` });
    const send = page.getByRole("button", { name: "送信", exact: true });
    if (method === "keyboard") await send.press("Enter");
    else await send.click();
    await page
      .getByRole("status")
      .filter({ hasText: "意見を受け付けました" })
      .waitFor();
    expect(await page.getByTestId("submitted-feedback").textContent()).toBe(
      body,
    );
    if (method === "click")
      await page.screenshot({ path: `${dir}/after-submit.png` });
  } finally {
    await context.close();
    if (video) await video.saveAs(`${dir}/text-submission.webm`);
  }
});

test.each([
  "確定して送信",
  "変換中にクリック",
])("ChromiumでIME入力後に%sして本文を保持する", async (method) => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await openFeedback(page);
    const textarea = page.getByLabel("文章（任意）");
    await textarea.focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "にほんご",
      selectionStart: 4,
      selectionEnd: 4,
    });
    expect(await textarea.inputValue()).toBe("にほんご");
    if (method === "確定して送信")
      await cdp.send("Input.insertText", { text: "日本語の変換を確定" });
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "意見を受け付けました" })
      .waitFor();
    expect(await page.getByTestId("submitted-feedback").textContent()).toBe(
      method === "確定して送信" ? "日本語の変換を確定" : "にほんご",
    );
  } finally {
    await page.close();
  }
});
