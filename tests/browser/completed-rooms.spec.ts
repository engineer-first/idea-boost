import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
it.each([
  375, 1280,
])("完了ルームの5場面・全文・再取得と出力へ%ipxで到達できる", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-detail--history&viewMode=story`,
    );
    const select = page.getByRole("combobox", { name: "見返す場面" });
    await select.waitFor();
    for (const kind of [
      "problem-grouping",
      "problem-decision",
      "question-decision",
      "idea-mapping",
      "idea-decision",
    ]) {
      await select.scrollIntoViewIfNeeded();
      await select.selectOption(kind);
      expect(await select.inputValue()).toBe(kind);
      await page
        .getByRole("heading", { name: "付箋の全文" })
        .scrollIntoViewIfNeeded();
      expect(
        await page
          .getByRole("region", { name: "当時の共有ボード" })
          .getByRole("list")
          .isVisible(),
      ).toBe(true);
    }
    const retry = page.getByRole("button", { name: "場面を再取得" });
    await retry.scrollIntoViewIfNeeded();
    const bounds = await retry.boundingBox();
    if (!bounds) throw new Error("再取得なし");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await retry.click();
    const save = page.getByRole("button", { name: "テキストを保存" });
    await save.scrollIntoViewIfNeeded();
    expect((await save.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const download = page.waitForEvent("download");
    await save.click();
    expect((await download).suggestedFilename()).toMatch(/idea-boost-outcome-/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-list--long-content&viewMode=story`,
    );
    const link = page.getByRole("link", { name: "成果を見る" });
    await link.waitFor();
    await link.scrollIntoViewIfNeeded();
    const linkBounds = await link.boundingBox();
    expect(linkBounds?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

it.each([
  375, 1280,
])("空の途中ページから続きの成果へ%ipxで進める", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-list--empty-page-with-more&viewMode=story`,
    );
    const more = page.getByRole("button", { name: "次のルームを表示" });
    await more.waitFor();
    expect(await page.getByText("以前のルームはまだありません。").count()).toBe(
      0,
    );
    expect(
      await page
        .getByText(
          "このページに表示できるルームはありません。続きのルームを確認してください。",
        )
        .isVisible(),
    ).toBe(true);
    await more.scrollIntoViewIfNeeded();
    const bounds = await more.boundingBox();
    if (!bounds) throw new Error("次ページ操作がありません");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await more.click();
    const detail = page.getByRole("link", { name: "成果を見る" });
    await detail.waitFor();
    await detail.scrollIntoViewIfNeeded();
    expect(await detail.isVisible()).toBe(true);
    expect(await more.count()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

it.each([
  390, 1280,
])("正常空から最新一覧を%ipxで再取得できる", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-list--empty-then-indexed&viewMode=story`,
    );
    const refresh = page.getByRole("button", { name: "最新の一覧を取得" });
    await refresh.waitFor();
    expect(
      await page.getByText("以前のルームはまだありません。").isVisible(),
    ).toBe(true);
    await refresh.scrollIntoViewIfNeeded();
    const bounds = await refresh.boundingBox();
    if (!bounds) throw new Error("最新一覧の取得操作がありません");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await refresh.focus();
    await page.keyboard.press("Enter");
    expect(await refresh.isDisabled()).toBe(true);
    await page.getByRole("link", { name: "成果を見る" }).waitFor();
    expect(await page.getByText("以前のルームはまだありません。").count()).toBe(
      0,
    );
    expect(await refresh.isEnabled()).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

it.each([
  390, 1280,
])("read-only成果の常設感想と500ms一回案内・送信・focusを%ipxで再利用できる", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => {} },
        configurable: true,
      }),
    );
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-detail--success&viewMode=story`,
    );
    const entry = page.getByRole("button", {
      name: "フィードバック",
      exact: true,
    });
    await entry.waitFor();
    await page
      .getByRole("button", { name: "全文をコピー", exact: true })
      .click();
    await page
      .getByText("コピーしました。メモに貼り付けて保存してください。", {
        exact: true,
      })
      .waitFor();
    await page.clock.runFor(499);
    expect(
      await page
        .getByRole("complementary", { name: "フィードバックの案内" })
        .count(),
    ).toBe(0);
    await page.clock.runFor(1);
    const prompt = page.getByRole("complementary", {
      name: "フィードバックの案内",
    });
    await prompt.waitFor();
    await prompt.getByRole("button", { name: "案内を閉じる" }).click();
    expect(await entry.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    await page
      .getByRole("button", { name: "全文をコピー", exact: true })
      .click();
    await page.clock.runFor(500);
    expect(await prompt.count()).toBe(0);
    await entry.click();
    const dialog = page.getByRole("dialog", { name: "フィードバック" });
    expect(
      await dialog.getByRole("combobox", { name: "対象" }).inputValue(),
    ).toBe("app");
    await dialog.getByText("よかった", { exact: true }).click();
    await dialog.getByRole("button", { name: "送信", exact: true }).click();
    await dialog.getByText(/受付ID：/).waitFor();
    await dialog.getByRole("button", { name: "受領画面を閉じる" }).click();
    expect(await entry.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    await entry.click();
    await dialog
      .getByRole("textbox", { name: "文章（任意）" })
      .fill("閉じても残る感想");
    await page.keyboard.press("Escape");
    expect(await entry.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    await entry.click();
    expect(
      await dialog.getByRole("textbox", { name: "文章（任意）" }).inputValue(),
    ).toBe("閉じても残る感想");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

it.each([
  390, 1280,
])("退出後の感想拒否でも入力と成果出力を%ipxで維持する", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=completedrooms-detail--feedback-after-leave&viewMode=story`,
    );
    const entry = page.getByRole("button", {
      name: "フィードバック",
      exact: true,
    });
    await entry.waitFor();
    await page.getByText(/感想は現在参加中のルームからのみ/).waitFor();
    await entry.click();
    const dialog = page.getByRole("dialog", { name: "フィードバック" });
    await dialog.getByText("よかった", { exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "文章（任意）" })
      .fill("退出後の感想は未送信");
    await dialog.getByRole("button", { name: "送信", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    expect(await dialog.getByRole("alert").innerText()).toContain(
      "退出・解散後は送信できません",
    );
    expect(
      await dialog.getByRole("textbox", { name: "文章（任意）" }).inputValue(),
    ).toBe("退出後の感想は未送信");
    expect(
      await dialog
        .getByRole("button", { name: "送信", exact: true })
        .isEnabled(),
    ).toBe(true);
    expect(await dialog.getByText(/受付ID：/).count()).toBe(0);
    await page.keyboard.press("Escape");
    expect(await entry.evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "テキストを保存" }).click();
    expect((await download).suggestedFilename()).toMatch(/idea-boost-outcome-/);
    await entry.click();
    expect(
      await dialog.getByRole("textbox", { name: "文章（任意）" }).inputValue(),
    ).toBe("退出後の感想は未送信");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});
