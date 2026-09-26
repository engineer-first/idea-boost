import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { NOTE_COLOR_STYLES } from "../../features/room-members/logic/note-color";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1000 },
  );
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 320, height: 640 } });
});
afterAll(async () => {
  await page?.close();
  await browser?.close();
});

test("320px 幅で長文カードの末尾まで読め、横にはみ出さない", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--long-content&viewMode=story`,
  );
  const outcome = page.getByTestId("room-outcome-view");
  await outcome.waitFor();
  const idea = outcome
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "採用したアイデア" }) });
  expect(await idea.locator("p").textContent()).toMatch(/末尾確認$/);
  expect(
    await idea.locator("p").evaluate((element) => element.textContent?.length),
  ).toBe(2000);
  expect(
    await outcome.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await idea.locator("p").evaluate((element) => {
    element.scrollIntoView({ block: "end" });
  });
  const tail = await idea.locator("p").evaluate((element) => {
    const text = element.firstChild;
    if (!text) return null;
    const range = document.createRange();
    range.setStart(
      text,
      text.textContent?.length ? text.textContent.length - 4 : 0,
    );
    range.setEnd(text, text.textContent?.length ?? 0);
    return range.getBoundingClientRect().toJSON();
  });
  expect(tail).not.toBeNull();
  expect(tail?.top).toBeGreaterThanOrEqual(0);
  expect(tail?.bottom).toBeLessThanOrEqual(640);
});

test("成果画面の背景とカードはアプリと付箋の配色に揃う", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--complete&viewMode=story`,
  );
  const colors = await page
    .getByTestId("room-outcome-view")
    .evaluate((main) => {
      const card = main.querySelector("section");
      if (!card) throw new Error("成果カードがありません");
      return {
        appBackground: getComputedStyle(document.body).backgroundColor,
        background: getComputedStyle(main).backgroundColor,
        cardBackground: getComputedStyle(card).backgroundColor,
        cardForeground: getComputedStyle(card).color,
      };
    });
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`;
  expect(colors.background).toBe(colors.appBackground);
  expect(colors.cardBackground).toBe(
    rgb(NOTE_COLOR_STYLES.yellow.backgroundColor),
  );
  expect(colors.cardForeground).toBe(
    rgb(NOTE_COLOR_STYLES.yellow.foregroundColor),
  );
});

test("テキスト保存と全文コピーには同じ3項目が入り、操作後も成果画面に留まる", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--complete&viewMode=story`,
  );
  await page.getByTestId("room-outcome-view").waitFor();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "テキストを保存" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const saved = Buffer.concat(chunks).toString("utf8");
  await page.getByRole("button", { name: "全文をコピー" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  for (const part of [
    "1. 決定した課題",
    "2. 決定した問い（HMW）",
    "3. 採用したアイデア",
    "次に試すこと",
  ]) {
    expect(saved).toContain(part);
    expect(copied).toContain(part);
  }
  const withoutExportDate = (value: string) =>
    value.replace(/^\uFEFF/, "").replace(/^出力日: .*$/m, "出力日");
  expect(withoutExportDate(saved)).toBe(withoutExportDate(copied));
  expect(
    await page.getByRole("heading", { name: "チームで決めた成果" }).isVisible(),
  ).toBe(true);
});
