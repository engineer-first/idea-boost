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

test.each([390, 1280])(
  "%ipx: フォームは16pxで入力でき、保存操作へ到達する",
  async (width) => {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomnamedialog--editing&viewMode=story`,
      );
      const input = page.getByRole("textbox");
      await input.waitFor();
      expect(
        await input.evaluate((node) => getComputedStyle(node).fontSize),
      ).toBe("16px");
      await input.fill("長いルーム名でも読みながら入力できる");
      await page.keyboard.press("Tab");
      const save = page.getByRole("button", { name: "保存する", exact: true });
      await save.focus();
      expect(
        await save.evaluate((node) => getComputedStyle(node).fontSize),
      ).toBe("16px");
      const bounds = await save.boundingBox();
      if (!bounds) throw new Error("保存ボタンが見つかりません");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(
        await save.evaluate((node) => node === document.activeElement),
      ).toBe(true);
      await save.click();
    } finally {
      await page.close();
    }
  },
);

test.each([390, 1280])(
  "%ipx: 成果のフィルターはPCでも16pxを保ち横に溢れない",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=sharedoutcomes-sharedoutcomesfilters--date-range&viewMode=story`,
      );
      await page.locator("input").first().waitFor();
      for (const control of await page
        .locator("input:not([type=checkbox]):not([type=radio]), select")
        .all()) {
        expect(
          await control.evaluate((node) => getComputedStyle(node).fontSize),
        ).toBe("16px");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);
