import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
it.each([
  390, 1280,
])("進行履歴の盤面選択・全文・再取得へ%ipxで到達できる", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=sharedoutcomes-sharedoutcomesview--detail&viewMode=story`,
    );
    const region = page.getByRole("region", {
      name: "進行の記録",
      exact: true,
    });
    await region.waitFor();
    for (const button of [
      region.getByRole("button", { name: /記録 1 の盤面を見る/ }),
      region.getByRole("button", { name: "記録の最新状態を取得" }),
      region.getByRole("button", { name: "次の記録を表示" }),
    ]) {
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      if (!bounds) throw new Error("button missing");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await button.click();
    }
    const selected = region.getByRole("region", { name: "選択した記録" });
    const tab = selected.getByRole("tab", { name: "課題" });
    await tab.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() =>
        selected
          .getByRole("tab", { name: "HMW" })
          .getAttribute("aria-selected"),
      )
      .toBe("true");
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() =>
        selected
          .getByRole("tab", { name: "課題" })
          .getAttribute("aria-selected"),
      )
      .toBe("true");
    const text = selected
      .getByRole("list")
      .getByText("待ち時間を減らす", { exact: true });
    await text.scrollIntoViewIfNeeded();
    expect(await text.isVisible()).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});
