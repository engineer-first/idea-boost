import { chromium, type Locator } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

async function expectInsideViewport(
  link: Locator,
  height: number,
): Promise<void> {
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? height) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
}

for (const story of [
  "guest",
  "member",
  "invited-guest",
  "invited-member",
  "returning-guest",
  "returning-member",
]) {
  test(`狭幅・低い画面でも末尾CTAとプライバシーへスクロール・Tabで到達できる: ${story}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 320, height: 360 },
      });
      await page.goto(
        `${origin}/iframe.html?id=landing-landingview--${story}&viewMode=story`,
      );
      const main = page.getByRole("main");
      // main 内の footer は contentinfo ランドマークにならない。
      const footer = main.locator("footer");
      const cta = footer.getByRole("link").first();
      const privacy = footer.getByRole("link", { name: "保存とプライバシー" });
      await cta.waitFor();
      expect(
        await main.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
      await cta.scrollIntoViewIfNeeded();
      await expectInsideViewport(cta, 360);
      await privacy.scrollIntoViewIfNeeded();
      await expectInsideViewport(privacy, 360);
      await main.evaluate((el) => {
        el.scrollTop = 0;
      });
      await main.getByRole("link").first().focus();
      let reachedCta = false;
      let reachedPrivacy = false;
      for (let index = 0; index < 8; index++) {
        if (await cta.evaluate((el) => el === document.activeElement)) {
          reachedCta = true;
          await expectInsideViewport(cta, 360);
        }
        if (await privacy.evaluate((el) => el === document.activeElement)) {
          reachedPrivacy = true;
          await expectInsideViewport(privacy, 360);
          break;
        }
        await page.keyboard.press("Tab");
      }
      expect(reachedCta).toBe(true);
      expect(reachedPrivacy).toBe(true);
    } finally {
      await browser.close();
    }
  });
}
