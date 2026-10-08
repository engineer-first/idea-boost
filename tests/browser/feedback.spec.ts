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
test.each([
  "待つ",
  "外へ移動",
  "閉じる",
])("送信完了が遅れても%s操作のフォーカスを維持する", async (action) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    `${origin}/iframe.html?id=feedback-feedbackpanel--delayed-submission&viewMode=story`,
  );
  const trigger = page.getByRole("button", {
    name: "フィードバック",
    exact: true,
  });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "フィードバック" });
  await panel.waitFor();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByText("よかった", { exact: true }).click();
  await page.getByRole("button", { name: "送信", exact: true }).click();
  expect(await page.getByRole("button", { name: "送信中…" }).isDisabled()).toBe(
    true,
  );
  const outside = page.getByRole("button", { name: "作業に戻る" }).first();
  if (action === "外へ移動") await outside.click();
  if (action === "閉じる") {
    await page.getByRole("button", { name: "入力欄を閉じる" }).click();
    await panel.waitFor({ state: "hidden" });
    expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(
      true,
    );
  }
  await page.clock.runFor(1000);
  if (action === "閉じる") {
    expect(await panel.count()).toBe(0);
    expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(
      true,
    );
  } else {
    await page.getByRole("button", { name: "別のフィードバック" }).waitFor();
    if (action === "外へ移動") {
      expect(await outside.evaluate((e) => e === document.activeElement)).toBe(
        true,
      );
    } else {
      expect(
        await panel.evaluate((e) => e.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "hidden" });
      expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(
        true,
      );
    }
  }
  await page.clock.resume();
});
test.each([
  "Escape",
  "閉じる",
  "送信して別の意見",
])("案内から開いた入力を%sで閉じると常設入口に戻り、入力を再開できる", async (close) => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomoutcomeview--with-feedback&viewMode=story`,
  );
  await page.getByRole("heading", { name: "チームで決めた成果" }).waitFor();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const save = page.getByRole("button", { name: "テキストを保存" });
  await save.focus();
  await page.keyboard.press("Enter");
  const prompt = page.getByRole("complementary", {
    name: "フィードバックの案内",
  });
  await prompt.waitFor();
  // 保存からTabだけで案内の入口まで進む。
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(
    await prompt
      .getByRole("button", { name: "フィードバック" })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "フィードバック" });
  await panel.waitFor();
  if (close === "送信して別の意見") {
    await page.getByText("よかった", { exact: true }).click();
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await page.getByRole("button", { name: "別のフィードバック" }).waitFor();
    expect(
      await panel.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(
      await panel
        .getByRole("button", { name: "作業に戻る" })
        .evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("button", { name: "別のフィードバック" })
        .evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Enter");
    expect(
      await panel.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    expect(
      await page
        .getByRole("button", { name: "フィードバック", exact: true })
        .evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await panel.waitFor();
  }
  await page.getByLabel("文章（任意）").fill("案内から書いた感想");
  if (close === "Escape") await page.keyboard.press("Escape");
  else {
    await page.getByRole("button", { name: "入力欄を閉じる" }).focus();
    await page.keyboard.press("Enter");
  }
  await panel.waitFor({ state: "hidden" });
  const permanent = page.getByRole("button", {
    name: "フィードバック",
    exact: true,
  });
  expect(await permanent.evaluate((e) => e === document.activeElement)).toBe(
    true,
  );
  expect(await prompt.count()).toBe(0);
  await page.keyboard.press("Enter");
  await panel.waitFor();
  expect(await page.getByLabel("文章（任意）").inputValue()).toBe(
    "案内から書いた感想",
  );
  await page.keyboard.press("Escape");
  expect(await permanent.evaluate((e) => e === document.activeElement)).toBe(
    true,
  );
});
test("狭幅でも5段階をキーボードで選び、種類だけでも送信でき、閉じると入口に戻る", async () => {
  await page.goto(
    `${origin}/iframe.html?id=feedback-feedbackpanel--interactive&viewMode=story`,
  );
  const panel = page.getByRole("dialog", { name: "フィードバック" });
  await panel.waitFor();
  // 自動表示のstoryを閉じ、実際の入口から開いて復帰先を設定する。
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
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
  await panel.getByRole("button", { name: "作業に戻る" }).focus();
  await page.keyboard.press("Enter");
  await panel.waitFor({ state: "hidden" });
  expect(
    await page
      .getByRole("button", { name: "フィードバック", exact: true })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  await panel.waitFor();
  await page.keyboard.press("Escape");
  expect(
    await page
      .getByRole("button", { name: "フィードバック", exact: true })
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
    await page
      .getByRole("complementary", { name: "フィードバックの案内" })
      .count(),
  ).toBe(0);
  await page.clock.runFor(499);
  expect(
    await page
      .getByRole("complementary", { name: "フィードバックの案内" })
      .count(),
  ).toBe(0);
  await page.clock.runFor(1);
  await page
    .getByRole("complementary", { name: "フィードバックの案内" })
    .waitFor();
  expect(
    await page.getByRole("button", { name: "テキストを保存" }).isEnabled(),
  ).toBe(true);
  for (let step = 0; step < 4; step++) await page.keyboard.press("Tab");
  expect(
    await page
      .getByRole("button", { name: "案内を閉じる" })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
  await page.keyboard.press("Enter");
  expect(
    await page
      .getByRole("button", { name: "フィードバック", exact: true })
      .evaluate((e) => e === document.activeElement),
  ).toBe(true);
  await page.getByRole("button", { name: "テキストを保存" }).click();
  await page.clock.runFor(500);
  expect(
    await page
      .getByRole("complementary", { name: "フィードバックの案内" })
      .count(),
  ).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "テキストを保存" }).click();
  await page.clock.runFor(500);
  expect(
    await page
      .getByRole("complementary", { name: "フィードバックの案内" })
      .count(),
  ).toBe(0);
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
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
    await page
      .getByRole("complementary", { name: "フィードバックの案内" })
      .count(),
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
  await page.getByRole("button", { name: /現在地/ }).click();
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  expect(await page.getByLabel("対象", { exact: true }).inputValue()).toMatch(
    /^[123]-[1-5]$/,
  );
  await page.getByRole("button", { name: "入力欄を閉じる" }).click();
  expect(await page.getByTestId("board-context-hud").isVisible()).toBe(true);
});

test.each([
  390, 1280,
])("%ipxでも「わからない」をキーボードで選び種類のみ送信できる", async (width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(
    `${origin}/iframe.html?id=feedback-feedbackpanel--interactive&viewMode=story`,
  );
  const panel = page.getByRole("dialog", { name: "フィードバック" });
  await panel.waitFor();
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const kind = page.getByRole("radio", { name: "わからない", exact: true });
  await kind.focus();
  await page.keyboard.press("Space");
  expect(await kind.isChecked()).toBe(true);
  expect(
    await page
      .getByRole("radio", { name: "使いにくい", exact: true })
      .isChecked(),
  ).toBe(false);
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "意見を受け付けました" })
    .waitFor();
});
