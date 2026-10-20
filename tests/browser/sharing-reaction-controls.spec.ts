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

test.each([
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
])(
  "$width × $height : 送信待機中もフォーカスを保ち、400ms後と3件上限の解除後にキーで再送できる",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(1000);
      await page.goto(
        `${origin}/iframe.html?id=room-sharingreactioncontrols--repeated-sending&viewMode=story`,
      );
      const trigger = page.getByRole("button", {
        name: "リアクション",
        exact: true,
      });
      await trigger.waitFor();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const like = page.getByRole("button", {
        name: "いいねを送る",
        exact: true,
      });
      await like.waitFor({ state: "visible" });
      const bounds = await like.boundingBox();
      if (!bounds) throw new Error("いいねの送信ボタンが表示されていません");
      await like.focus();
      const sentCount = page.getByRole("status", { name: "いいねの送信回数" });
      await page.keyboard.press("Space");
      expect(await sentCount.textContent()).toBe("1");
      await page.keyboard.press("Enter");
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      expect(await sentCount.textContent()).toBe("1");

      await page.clock.runFor(399);
      await page.keyboard.press("Space");
      expect(await sentCount.textContent()).toBe("1");
      await page.clock.runFor(1);
      expect(
        await like.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Enter");
      expect(await sentCount.textContent()).toBe("2");
      await page.clock.runFor(400);
      await page.keyboard.press("Space");
      expect(await sentCount.textContent()).toBe("3");

      await page.clock.runFor(400);
      await page.keyboard.press("Enter");
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      expect(await sentCount.textContent()).toBe("3");
      await page.clock.runFor(1_799);
      await page.keyboard.press("Space");
      expect(await sentCount.textContent()).toBe("3");
      await page.clock.runFor(1);
      expect(
        await like.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Enter");
      expect(await sentCount.textContent()).toBe("4");
      expect(await like.isVisible()).toBe(true);
      await page.keyboard.press("Escape");
      await like.waitFor({ state: "hidden" });
      expect(await like.count()).toBe(0);
    } finally {
      await page.close();
    }
  },
);
