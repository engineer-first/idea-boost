import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(async () => {
  await page?.close();
  await browser?.close();
});

async function createStudy(): Promise<void> {
  await page
    .getByRole("button", { name: "調査の手順を作る", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "誰の困りごとを調べたいですか？",
      exact: true,
    })
    .fill("空きコマに勉強仲間を探す学生");
  await page
    .getByRole("button", { name: "補足して手順を作る", exact: true })
    .click();
  await page
    .getByRole("button", { name: "共通の手順を更新する", exact: true })
    .click();
  await page.getByRole("article", { name: "調査の手順" }).waitFor();
}

test.each([
  { width: 320, height: 640 },
  { width: 1280, height: 800 },
])(
  "$width pxで最初の画面から調査へ進め、手順送りと戻る操作で現在地へフォーカスする",
  async (viewport) => {
    await page.setViewportSize(viewport);
    await page.goto(
      `${origin}/iframe.html?id=room-outcomereflectioncontainer--outcome-page&viewMode=story`,
    );
    const entry = page.getByRole("button", {
      name: "調査を準備する",
      exact: true,
    });
    await entry.waitFor();
    // 実アプリの上部ヘッダー69pxを除いても、最初の操作が収まる。
    const bounds = await entry.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height - 69,
    );
    const outcome = page.getByTestId("room-outcome-view");
    expect(
      await outcome.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await entry.click();

    expect(
      await page
        .getByRole("heading", { name: "ニーズ調査の準備" })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await createStudy();
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    const heading = page
      .getByRole("article", { name: "調査の手順" })
      .getByRole("heading");
    expect(
      await heading.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    const stepBounds = await heading.boundingBox();
    expect(stepBounds?.y).toBeGreaterThanOrEqual(0);
    expect(
      (stepBounds?.y ?? 0) + (stepBounds?.height ?? 0),
    ).toBeLessThanOrEqual(viewport.height - 69);
    await page.getByRole("button", { name: "次のアクションに戻る" }).click();
    expect(
      await entry.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await page.getByRole("button", { name: "競合・代替手段を調べる" }).click();
    await page.getByRole("button", { name: "競合調査の依頼文を作る" }).click();
    await page
      .getByRole("button", { name: "依頼文をコピー", exact: true })
      .waitFor();
    const promptText = page.getByRole("textbox", {
      name: "競合調査プロンプト全文",
    });
    const showPrompt = page.getByText("依頼文の全文を確認", { exact: true });
    expect(await showPrompt.count()).toBe(1);
    expect(await promptText.isVisible()).toBe(false);
    await showPrompt.click();
    expect(await promptText.isVisible()).toBe(true);
    expect(await promptText.inputValue()).toContain("出典URL");
    expect(
      await outcome.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  },
);

test("動きを減らす設定でも手順を切り替えられ、内容を動かさない", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(
    `${origin}/iframe.html?id=room-outcomereflectioncontainer--outcome-page&viewMode=story`,
  );
  await page.getByRole("button", { name: "調査を準備する" }).click();
  await createStudy();
  const article = page.getByRole("article", { name: "調査の手順" });
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  expect(
    await article.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe("none");
  expect(
    await article
      .getByRole("progressbar")
      .locator("span")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
  expect(
    await article
      .getByRole("heading")
      .evaluate((element) => element === document.activeElement),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("キーボード操作で遷移した見出しにfocus-visibleの枠を表示する", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(
    `${origin}/iframe.html?id=room-outcomereflectioncontainer--outcome-page&viewMode=story`,
  );
  const entry = page.getByRole("button", {
    name: "調査を準備する",
    exact: true,
  });
  await entry.waitFor();
  await entry.focus();
  await page.keyboard.press("Enter");
  const title = page.getByRole("heading", { name: "ニーズ調査の準備" });
  expect(
    await title.evaluate((element) => ({
      focused: element === document.activeElement,
      visible: element.matches(":focus-visible"),
      outlineStyle: getComputedStyle(element).outlineStyle,
      outlineWidth: getComputedStyle(element).outlineWidth,
    })),
  ).toMatchObject({
    focused: true,
    visible: true,
    outlineStyle: "solid",
  });
  await createStudy();
  const next = page.getByRole("button", { name: "次へ", exact: true });
  await next.focus();
  await page.keyboard.press("Enter");
  const stepTitle = page
    .getByRole("article", { name: "調査の手順" })
    .getByRole("heading");
  expect(
    await stepTitle.evaluate((element) => ({
      focused: element === document.activeElement,
      visible: element.matches(":focus-visible"),
      outlineStyle: getComputedStyle(element).outlineStyle,
    })),
  ).toMatchObject({
    focused: true,
    visible: true,
    outlineStyle: "solid",
  });
});
