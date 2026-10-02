import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/private-note-guidance";
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

async function openStory(name: string, width: number, touch = false) {
  page = await browser.newPage({
    viewport: { width, height: 844 },
    hasTouch: touch,
  });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--private-guidance-${name}&viewMode=story`,
  );
  await page.getByTestId("board-frame").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function expectInsideViewport(selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );
}

for (const width of [390, 1280]) {
  test(`${width}px: 空のマイ付箋からTab/Enterで一枚作成し、本文を入力する`, async () => {
    await openStory("empty", width);
    expect(await page.getByTestId("note-card").count()).toBe(0);
    const add = page.getByRole("button", { name: "付箋を追加" });
    expect(await add.innerText()).toContain("追加");
    await expectInsideViewport('[aria-label="付箋を追加"]');
    await add.focus();
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("button", { name: "マイ付箋を閉じる" })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.getByTestId("note-card").count()).toBe(1);
    await expect
      .poll(() => page.locator("textarea:not([readonly])").count())
      .toBe(1);
    await page.keyboard.insertText("自分で書いた下書き");
    await page.keyboard.press("Escape");
    expect(await page.getByRole("textbox").inputValue()).toBe(
      "自分で書いた下書き",
    );
    expect(
      await page.getByRole("button", { name: "ボードに共有" }).isDisabled(),
    ).toBe(true);
    await page.screenshot({ path: `${output}/${width}-personal.png` });
  });

  test(`${width}px: 複数の下書きから一枚を共有し、タッチ相当で個人へ戻す`, async () => {
    await openStory("sharing", width, true);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(await toolbar.getByTestId("note-card").count()).toBe(2);
    expect(
      await page.getByRole("button", { name: "付箋を追加" }).isDisabled(),
    ).toBe(true);
    expect(await toolbar.innerText()).toContain("追加は個人作業");
    const firstShareBounds = await toolbar
      .getByRole("button", { name: "ボードに共有" })
      .first()
      .boundingBox();
    const scrollBounds = await page
      .getByTestId("private-notes-scroll")
      .boundingBox();
    expect(firstShareBounds).not.toBeNull();
    expect(
      (firstShareBounds?.y ?? 0) + (firstShareBounds?.height ?? 0),
    ).toBeLessThanOrEqual((scrollBounds?.y ?? 0) + (scrollBounds?.height ?? 0));
    await page.screenshot({
      path: `${output}/${width}-sharing-before-action.png`,
    });
    const share = toolbar.getByRole("button", { name: "ボードに共有" }).first();
    await share.scrollIntoViewIfNeeded();
    await share.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => toolbar.getByTestId("note-card").count()).toBe(1);
    expect(await toolbar.getAttribute("data-expanded")).toBe(
      width < 640 ? "false" : "true",
    );
    const back = page.getByRole("button", { name: "マイ付箋へ戻す" });
    await back.waitFor();
    await page.screenshot({ path: `${output}/${width}-return-action.png` });
    await back.tap();
    await expect.poll(() => toolbar.getByTestId("note-card").count()).toBe(2);
    expect(await toolbar.getAttribute("data-expanded")).toBe("true");
    expect(
      await page.getByRole("button", { name: "マイ付箋へ戻す" }).count(),
    ).toBe(0);
  });

  test(`${width}px: ホストの共有工程でも最初の共有操作がスクロール前に見える`, async () => {
    await openStory("sharing-host", width);
    const share = page
      .getByTestId("private-notes-toolbar")
      .getByRole("button", { name: "ボードに共有" })
      .first();
    const bounds = await share.boundingBox();
    const scroll = await page.getByTestId("private-notes-scroll").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y).toBeGreaterThanOrEqual(scroll?.y ?? 0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      (scroll?.y ?? 0) + (scroll?.height ?? 0),
    );
    await page.screenshot({ path: `${output}/${width}-sharing-host.png` });
  });

  test(`${width}px: 切断理由が見え、共有・追加を実行できない`, async () => {
    await openStory("disconnected", width);
    const toolbar = page.getByTestId("private-notes-toolbar");
    expect(await toolbar.innerText()).toContain("接続を確認中");
    expect(
      await page.getByRole("button", { name: "付箋を追加" }).isDisabled(),
    ).toBe(true);
    expect(
      await toolbar
        .getByRole("button", { name: "ボードに共有" })
        .first()
        .isDisabled(),
    ).toBe(true);
    await page.screenshot({ path: `${output}/${width}-disconnected.png` });
  });

  test(`${width}px: 投票では下書き共有/戻すを出さず編集不可理由を選択点で示す`, async () => {
    await openStory("voting", width);
    expect(await page.getByTestId("private-notes-toolbar").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: "マイ付箋へ戻す" }).count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "付箋", exact: true })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    expect(await page.getByText("投票中は本文を編集できません").count()).toBe(
      1,
    );
    expect(await page.locator("textarea:not([readonly])").count()).toBe(0);
    await page.screenshot({ path: `${output}/${width}-voting.png` });
  });
}
