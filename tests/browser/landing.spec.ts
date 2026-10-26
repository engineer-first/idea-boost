import { chromium, type Locator } from "playwright";
import { expect, test } from "vitest";

const landingStories = [
  "guest",
  "member",
  "invited-guest",
  "invited-member",
  "returning-guest",
  "returning-member",
] as const;

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

for (const story of landingStories) {
  test(`狭幅・低い画面でも問い合わせ・末尾CTA・プライバシーへスクロール・Tabで到達できる: ${story}`, async () => {
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
      const contact = main.getByRole("link", { name: /問い合わせ/ });
      expect(await contact.count()).toBe(1);
      expect(
        await main.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await contact.scrollIntoViewIfNeeded();
      await expectInsideViewport(contact, 360);
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
      let reachedContact = false;
      let reachedCta = false;
      let reachedPrivacy = false;
      const tabLimit =
        (await main
          .locator(
            'a[href], button, summary, input, select, textarea, [tabindex="0"]',
          )
          .count()) + 2;
      for (let index = 0; index < tabLimit; index++) {
        if (await contact.evaluate((el) => el === document.activeElement)) {
          reachedContact = true;
          await expectInsideViewport(contact, 360);
        }
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
      expect(reachedContact).toBe(true);
      expect(reachedCta).toBe(true);
      expect(reachedPrivacy).toBe(true);
    } finally {
      await browser.close();
    }
  });
}

for (const story of landingStories) {
  test(`FAQをEnterとSpaceで開閉して回答を読める: ${story}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 320, height: 360 },
      });
      await page.goto(
        `${origin}/iframe.html?id=landing-landingview--${story}&viewMode=story`,
      );
      const main = page.getByRole("main");
      await main.getByRole("heading", { level: 1 }).waitFor();
      const items = main.locator("details");
      expect(await items.count()).toBeGreaterThan(0);
      for (const item of await items.all()) {
        const summary = item.locator("summary");
        const answer = item.locator("summary + *");
        await summary.focus();
        expect(await answer.isVisible()).toBe(false);
        for (const key of ["Enter", "Space"]) {
          await page.keyboard.press(key);
          await page.waitForFunction(() =>
            document.activeElement?.parentElement?.hasAttribute("open"),
          );
          expect(await answer.isVisible()).toBe(true);
          expect(
            await main.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(320);
          await page.keyboard.press(key);
          await page.waitForFunction(
            () => !document.activeElement?.parentElement?.hasAttribute("open"),
          );
          expect(await answer.isVisible()).toBe(false);
        }
      }
    } finally {
      await browser.close();
    }
  });

  test(`PCの初期表示で主CTAに到達できる: ${story}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.goto(
        `${origin}/iframe.html?id=landing-landingview--${story}&viewMode=story`,
      );
      const cta = page
        .getByRole("main")
        .locator("section")
        .first()
        .getByRole("link")
        .first();
      await cta.waitFor();
      await expectInsideViewport(cta, 720);
    } finally {
      await browser.close();
    }
  });
}
