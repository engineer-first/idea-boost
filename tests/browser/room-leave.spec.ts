import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;

beforeAll(async () => {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${origin}/index.json`);
      expect(response.ok).toBe(true);
      await response.arrayBuffer();
    },
    { timeout: 90_000, interval: 1000 },
  );
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

test.each([
  { width: 390, height: 844 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
  { width: 390, height: 320 },
])("確認と安全側の操作に到達できる（$width × $height）", async (viewport) => {
  const context = await browser.newContext({ viewport });
  try {
    for (const story of ["leave", "disband", "completed-host-leave"]) {
      const page = await context.newPage();
      await page.goto(
        `${origin}/iframe.html?id=room-leaveconfirmdialog--${story}&viewMode=story`,
      );
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      const cancel = dialog.getByRole("button", {
        name: /キャンセル|退出をやめて/,
      });
      await vi.waitFor(async () =>
        expect(
          await cancel.evaluate((button) => button === document.activeElement),
        ).toBe(true),
      );
      if (story === "completed-host-leave") {
        expect(
          await dialog.getByRole("button", { name: /削除|解散/ }).count(),
        ).toBe(0);
      }
      const buttons = dialog.getByRole("button");
      for (const button of await buttons.all()) {
        await button.scrollIntoViewIfNeeded();
        await vi.waitFor(async () => {
          const box = await button.boundingBox();
          expect(box).not.toBeNull();
          if (!box) return;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
          expect(
            await button.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return element.contains(
                document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                ),
              );
            }),
          ).toBe(true);
        });
      }
      await cancel.focus();
      await page.keyboard.press("Tab");
      expect(
        await dialog
          .getByTestId("leave-confirm-action")
          .evaluate((button) => button === document.activeElement),
      ).toBe(true);
      await page.keyboard.press("Tab");
      expect(
        await cancel.evaluate((button) => button === document.activeElement),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.close();
    }
  } finally {
    await context.close();
  }
});

test("退出・解散・完了後退出の処理中は再送も取消も押せない", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    for (const story of ["leaving", "disbanding", "completed-leaving"]) {
      const page = await context.newPage();
      await page.goto(
        `${origin}/iframe.html?id=room-leaveconfirmdialog--${story}&viewMode=story`,
      );
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      for (const button of await dialog.getByRole("button").all()) {
        expect(await button.isDisabled()).toBe(true);
      }
      await page.close();
    }
  } finally {
    await context.close();
  }
});
