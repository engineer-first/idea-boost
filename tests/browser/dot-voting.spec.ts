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
  page = await browser.newPage();
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

test.each([
  1280, 390,
])("%ipx: 投票の送信・拒否・完了を目で確認でき、残票操作へ届く", async (width) => {
  await page.setViewportSize({ width, height: 844 });
  for (const state of ["pending", "failed", "exhausted"]) {
    await page.goto(
      `${origin}/iframe.html?id=dotvote-dotvotepalette--${state}&viewMode=story`,
    );
    const palette = page.getByRole("region", { name: "投票パレット" });
    await palette.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const status = palette.getByRole("status");
    const bounds = await status.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(16);
    expect(bounds?.width).toBeGreaterThan(100);
    expect(
      await status.evaluate((element) => getComputedStyle(element).clip),
    ).toBe("auto");
    const region = await palette.boundingBox();
    if (!region || !bounds) throw new Error("投票状態が見つかりません");
    expect(bounds.x).toBeGreaterThanOrEqual(region.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      region.x + region.width + 1,
    );
    expect(region.x + region.width).toBeLessThanOrEqual(width);
    if (state !== "exhausted") {
      const sticker = palette.getByRole("button", {
        name: "主観シール 残り1票",
      });
      const button = await sticker.boundingBox();
      if (!button) throw new Error("投票シールが見つかりません");
      const point = {
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
      };
      expect(
        await sticker.evaluate(
          (element, p) => element.contains(document.elementFromPoint(p.x, p.y)),
          point,
        ),
      ).toBe(true);
      await page.mouse.click(point.x, point.y);
      expect(await sticker.isEnabled()).toBe(true);
    }
  }
});
