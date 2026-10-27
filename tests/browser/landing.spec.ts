import { chromium, type Locator } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const guestUrl = `${origin}/iframe.html?id=landing-landingview--guest&viewMode=story`;

async function expectInsideViewport(link: Locator): Promise<void> {
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 360) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
}

test("未ログインの320×360画面で横溢れせず末尾CTAへスクロール・Tabで到達できる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 360 },
    });
    await page.goto(guestUrl);
    const main = page.getByRole("main");
    const cta = main.locator("footer").getByRole("link").first();
    await cta.waitFor();
    expect(await main.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await cta.scrollIntoViewIfNeeded();
    await expectInsideViewport(cta);
    await main.evaluate((el) => {
      el.scrollTop = 0;
    });
    await main.getByRole("link").first().focus();
    const tabLimit =
      (await main
        .locator(
          'a[href], button, summary, input, select, textarea, [tabindex="0"]',
        )
        .count()) + 2;
    let reached = false;
    for (let i = 0; i < tabLimit; i++) {
      if (await cta.evaluate((el) => el === document.activeElement)) {
        reached = true;
        await expectInsideViewport(cta);
        break;
      }
      await page.keyboard.press("Tab");
    }
    expect(reached).toBe(true);
  } finally {
    await browser.close();
  }
});

test("reduced-motionではヒーローとFeaturesの装飾アニメーションが0件になる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(guestUrl);
    const decoration = page.getByTestId("landing-demo-decoration");
    await decoration.waitFor();
    expect(
      await page.getByTestId("landing-feature-decoration").count(),
    ).toBeGreaterThan(0);
    expect(
      await page
        .getByRole("main")
        .evaluate((el) => el.getAnimations({ subtree: true }).length),
    ).toBe(0);
  } finally {
    await browser.close();
  }
});
