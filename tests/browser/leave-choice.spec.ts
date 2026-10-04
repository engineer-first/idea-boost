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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`退出の選択をキーボードで切り替え、確定まで到達できる ${viewport.width}`, async () => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-leaveconfirmdialog--leave&viewMode=story`,
      );
      const keep = page.getByRole("radio", {
        name: "成果を残して退出",
        exact: true,
      });
      const discard = page.getByRole("radio", {
        name: "成果を残さず退出",
        exact: true,
      });
      await keep.waitFor();
      expect(await keep.isChecked()).toBe(true);
      await keep.focus();
      await page.keyboard.press("ArrowDown");
      expect(await discard.isChecked()).toBe(true);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const confirm = page.getByRole("button", {
        name: "成果を残さず退出",
        exact: true,
      });
      expect(
        await confirm.evaluate((el) => el === document.activeElement),
      ).toBe(true);
      for (const control of [keep, discard, confirm]) {
        const box = await control.boundingBox();
        if (!box) throw new Error("退出操作が描画されていません");
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      const dialog = page.getByRole("alertdialog");
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await confirm.click();
    } finally {
      await page.close();
    }
  });
}
