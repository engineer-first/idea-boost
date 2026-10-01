import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each([
  "分",
  "秒",
])("タイマーの%s欄は実IME変換中に値を保ち、確定時に全角数字を正規化する", async (part) => {
  const page = await browser.newPage();
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomtimer--idle-host-panel-open&viewMode=story`,
    );
    const input = page.getByLabel(`タイマー時間（${part}）`);
    await input.waitFor();
    await input.focus();
    await input.selectText();
    const session = await page.context().newCDPSession(page);
    await session.send("Input.imeSetComposition", {
      text: "１２",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await expect.poll(() => input.inputValue()).toBe("１２");
    expect(
      await page
        .getByRole("button", { name: "開始", exact: true })
        .isDisabled(),
    ).toBe(true);
    await session.send("Input.insertText", { text: "１２" });
    await expect.poll(() => input.inputValue()).toBe("12");
    await input.blur();
    expect(await input.inputValue()).toBe("12");
    expect(
      await page.getByRole("button", { name: "開始", exact: true }).isEnabled(),
    ).toBe(true);
    await session.detach();
  } finally {
    await page.close();
  }
});

test("全角の貼り付け相当の入力は12:30を保持し、ゼロ時間は開始できない", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomtimer--idle-host-panel-open&viewMode=story`,
    );
    const minutes = page.getByLabel("タイマー時間（分）");
    const seconds = page.getByLabel("タイマー時間（秒）");
    await minutes.fill("１２");
    await seconds.fill("３０");
    expect(await minutes.inputValue()).toBe("12");
    expect(await seconds.inputValue()).toBe("30");
    expect(
      await page.getByRole("button", { name: "開始", exact: true }).isEnabled(),
    ).toBe(true);
    await minutes.fill("００");
    await seconds.fill("００");
    expect(
      await page
        .getByRole("button", { name: "開始", exact: true })
        .isDisabled(),
    ).toBe(true);
  } finally {
    await page.close();
  }
});
