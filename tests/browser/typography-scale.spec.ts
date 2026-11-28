import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { includeMobile, widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each(widths(390, 1280))(
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

test.skipIf(!includeMobile)(
  "画面下端の候補メニューは一行で収まり、除外する操作へ到達できる",
  async () => {
    const page = await browser.newPage({
      viewport: { width: 360, height: 568 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(
        `${origin}/iframe.html?id=notes-notecard--candidate-action-for-touch&viewMode=story`,
      );
      const surface = page.getByRole("button", { name: "付箋", exact: true });
      await surface.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId("note-card").evaluate((node) => {
        node.style.top = "380px";
      });
      await surface.click({ button: "right" });
      const menu = page.getByRole("menu", { name: "付箋の候補操作" });
      await menu.waitFor();
      const item = menu.getByRole("menuitem", { name: "除外する" });
      const lines = await item.evaluate((node) => {
        const text = Array.from(node.childNodes).find(
          (child) =>
            child.nodeType === Node.TEXT_NODE &&
            child.textContent?.includes("除外する"),
        );
        if (!text) throw new Error("操作ラベルがありません");
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getClientRects().length;
      });
      expect(lines).toBe(1);
      const bounds = await menu.boundingBox();
      if (!bounds) throw new Error("候補メニューがありません");
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
      await item.click();
      await menu.waitFor({ state: "hidden" });
    } finally {
      await page.close();
    }
  },
);
