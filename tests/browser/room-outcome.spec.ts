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
    "2. 決定した問い",
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

test("日本時間の深夜でも保存ファイル名と本文の日付が一致する", async () => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const localPage = await context.newPage();
  try {
    await localPage.clock.install({
      time: new Date("2026-09-25T15:30:00Z"),
    });
    await localPage.goto(
      `${origin}/iframe.html?id=room-roomoutcomeview--complete&viewMode=story`,
    );
    await localPage.getByTestId("room-outcome-view").waitFor();
    const downloadPromise = localPage.waitForEvent("download");
    await localPage.getByRole("button", { name: "テキストを保存" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const saved = Buffer.concat(chunks).toString("utf8");
    expect(download.suggestedFilename()).toBe(
      "idea-boost-outcome-2026-09-26.txt",
    );
    expect(saved).toContain("出力日: 2026/09/26 00:30");
  } finally {
    await context.close();
  }
});

test("再コピー中は前の成功を消して二重操作を防ぎ、完了後に通知する", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--complete&viewMode=story`,
  );
  await page.getByRole("button", { name: "全文をコピー" }).click();
  await page.getByRole("status").waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            window.addEventListener("finish-copy", () => resolve(), {
              once: true,
            });
          }),
      },
    });
  });
  await page.getByRole("button", { name: "全文をコピー" }).click();
  expect(
    await page.getByRole("button", { name: "コピー中…" }).isDisabled(),
  ).toBe(true);
  expect(
    await page.getByRole("button", { name: "テキストを保存" }).isDisabled(),
  ).toBe(true);
  expect(await page.getByRole("status").count()).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event("finish-copy")));
  await page.getByRole("status").waitFor();
  expect(
    await page.getByRole("button", { name: "全文をコピー" }).isEnabled(),
  ).toBe(true);
});

test("コピー拒否時の全文をキーボードで選択でき、再試行で回復する", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--complete&viewMode=story`,
  );
  await page.getByTestId("room-outcome-view").waitFor();
  await page.evaluate(() => {
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async () => {
      navigator.clipboard.writeText = original;
      throw new Error("Permission denied");
    };
  });
  await page.getByRole("button", { name: "全文をコピー" }).click();
  const manual = page.getByRole("textbox", {
    name: "手動でコピーする成果全文",
  });
  await manual.waitFor();
  const text = await manual.inputValue();
  for (const section of await page
    .getByTestId("room-outcome-view")
    .locator("section")
    .all()) {
    if (await section.getByRole("heading", { name: "次に試すこと" }).count())
      continue;
    expect(text).toContain(await section.locator("p").innerText());
  }
  await page.keyboard.press("Tab");
  expect(
    await manual.evaluate((element) => element === document.activeElement),
  ).toBe(true);
  expect(
    await manual.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd - element.selectionStart,
    ),
  ).toBe(text.length);
  await page.getByRole("button", { name: "全文をコピー" }).click();
  await page.getByRole("status").waitFor();
  expect(await manual.count()).toBe(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test("保存失敗からコピーに回復し、成功通知の500ms後に感想を案内する", async () => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const localPage = await context.newPage();
  try {
    await localPage.clock.install();
    await localPage.goto(
      `${origin}/iframe.html?id=room-roomoutcomeview--with-feedback&viewMode=story`,
    );
    await localPage.getByTestId("room-outcome-view").waitFor();
    await localPage.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error("Unavailable");
      };
    });
    await localPage.getByRole("button", { name: "テキストを保存" }).click();
    await localPage.getByRole("alert").waitFor();
    expect(
      await localPage
        .getByRole("complementary", { name: "フィードバックの案内" })
        .count(),
    ).toBe(0);
    await localPage.clock.pauseAt(new Date());
    await localPage.getByRole("button", { name: "全文をコピー" }).click();
    await localPage.getByText(/コピーしました/).waitFor();
    await localPage.clock.runFor(499);
    expect(
      await localPage
        .getByRole("complementary", { name: "フィードバックの案内" })
        .count(),
    ).toBe(0);
    await localPage.clock.runFor(1);
    await localPage
      .getByRole("complementary", { name: "フィードバックの案内" })
      .waitFor();
    expect(
      await localPage
        .getByRole("button", { name: "フィードバック", exact: true })
        .count(),
    ).toBe(2);
  } finally {
    await context.close();
  }
});
