import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

it.each([390, 1280])(
  "閲覧者管理の入力・削除操作が%ipxで画面内に収まる",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(
        `${origin}/iframe.html?id=access-accessview--default&viewMode=story`,
      );
      const input = page.getByRole("textbox", { name: "メールアドレス" });
      await input.waitFor();
      for (const element of [
        input,
        page.getByRole("button", {
          name: "owner@example.test の閲覧権限を削除",
        }),
      ]) {
        const bounds = await element.boundingBox();
        if (!bounds) throw new Error("管理操作が表示されていません。");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      await input.click();
      expect(
        await input.evaluate((element) => element === document.activeElement),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  },
);
