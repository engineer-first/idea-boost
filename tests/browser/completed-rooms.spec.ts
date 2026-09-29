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
