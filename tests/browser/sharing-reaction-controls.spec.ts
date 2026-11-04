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
  { width: 320, height: 812 },
])(
  "$width × $height : 5種類へTabで到達し、対応する種類を送り、バーを保つ",
  async (viewport) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-notefontsizecontrols--default&viewMode=story`,
      );
      const fontSizeControls = page.getByTestId("note-font-size-controls");
      await fontSizeControls.waitFor();
      const fontSizeBounds = await fontSizeControls.boundingBox();
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
      await trigger.click();
      await page.clock.runFor(250);
      const bar = page.getByRole("dialog", { name: "リアクションを選ぶ" });
      await bar.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      const bounds = await bar.boundingBox();
      expect(bounds?.height).toBe(fontSizeBounds?.height);
      expect(bounds).toMatchObject({ width: 166, height: 38 });
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
      const choices = [
        ["いいねを送る", "いいね", "like"],
        ["拍手を送る", "拍手", "clap"],
        ["おお！を送る", "おお！", "surprised"],
        ["なるほどを送る", "なるほど", "insight"],
        ["どうして？のリアクションを送る", "どうして？", "question"],
      ];
      const count = page.getByRole("status", {
        name: "リアクションの送信回数",
      });
      const last = page.getByRole("status", {
        name: "最後に送ったリアクション",
      });
      for (const [index, [name, label, kind]] of choices.entries()) {
        if (index > 0) await page.clock.runFor(index === 3 ? 2200 : 400);
        const button = bar.getByRole("button", { name, exact: true });
        if (index === 0) await button.focus();
        else await page.keyboard.press("Tab");
        expect(
          await button.evaluate(
            (element) => element === document.activeElement,
          ),
        ).toBe(true);
        const image = button.locator("img");
        expect(
          await image.evaluate(async (element: HTMLImageElement) => {
            await element.decode();
            return element.naturalWidth;
          }),
        ).toBeGreaterThan(0);
        expect(
          decodeURIComponent((await image.getAttribute("src")) ?? ""),
        ).toContain(`/reactions/${kind}-3d.webp`);
        await page.keyboard.press(index % 2 ? "Space" : "Enter");
        expect(await count.textContent()).toBe(String(index + 1));
        expect(await last.textContent()).toBe(label);
        expect(
          await button.evaluate(
            (element) => element === document.activeElement,
          ),
        ).toBe(true);
        expect(await bar.getByRole("button").count()).toBe(5);
        expect(await bar.locator('button[aria-disabled="true"]').count()).toBe(
          5,
        );
      }
      await page.keyboard.press("Escape");
      await bar.waitFor({ state: "hidden" });
    } finally {
      await page.close();
    }
  },
);

test.each([
  { width: 1280, story: "sharing-reactions" },
  { width: 375, story: "sharing-reactions-with-history" },
  { width: 320, story: "sharing-reactions-with-history" },
])(
  "$width px：リアクションバーの右端が、折り返しやリサイズ後もツールバーの右端に揃う",
  async ({ width, story }) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-canvaszoomcontrols--${story}&viewMode=story`,
      );
      const toolbar = page.getByTestId("canvas-zoom-controls");
      const trigger = page.getByRole("button", {
        name: "リアクション",
        exact: true,
      });
      await trigger.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const closedToolbarBounds = await toolbar.boundingBox();
      await trigger.click();
      const bar = page.getByRole("dialog", { name: "リアクションを選ぶ" });
      await bar.waitFor();
      await bar.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      expect(await toolbar.boundingBox()).toEqual(closedToolbarBounds);
      async function expectAligned() {
        await expect
          .poll(async () => {
            const tools = await toolbar.boundingBox();
            const choices = await bar.boundingBox();
            if (!tools || !choices) return Number.POSITIVE_INFINITY;
            return Math.abs(
              choices.x + choices.width - (tools.x + tools.width),
            );
          })
          .toBeLessThan(1);
        expect(await bar.boundingBox()).toMatchObject({
          width: 166,
          height: 38,
        });
      }
      await expectAligned();
      if (width === 1280) {
        await page.setViewportSize({ width: 320, height: 800 });
        await expectAligned();
      }
      await bar.getByRole("button").last().click();
      expect(await bar.isVisible()).toBe(true);
      await page.keyboard.press("Escape");
      await bar.waitFor({ state: "hidden" });
      expect(
        await trigger.evaluate((button) => button === document.activeElement),
      ).toBe(true);
    } finally {
      await page.close();
    }
  },
);

test.each([
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
])(
  "$width × $height : 送信待機中も通常カーソルとフォーカスを保ち、400ms後と3件上限の解除後に再送できる",
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
      const sentCount = page.getByRole("status", {
        name: "リアクションの送信回数",
      });
      const readyCursor = await like.evaluate(
        (button) => getComputedStyle(button).cursor,
      );
      await page.keyboard.press("Space");
      expect(await sentCount.textContent()).toBe("1");
      expect(
        await like.evaluate((button) => getComputedStyle(button).cursor),
      ).toBe(readyCursor);
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
      await expect.poll(() => like.getAttribute("aria-disabled")).toBe("false");
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
