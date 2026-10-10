import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/board-layout/idea-writing-hints";
let browser: Browser;
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function open(page: Page, story: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator("#storybook-root").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [390, 1280]) {
  test(`${width}px: 書き出しの補足をキーボードで開閉し、例と操作が画面内に収まる`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await open(page, "room-boardhelppanel--writing");
      const guide = page.getByTestId("idea-guide-panel");
      await guide.waitFor();
      const toggle = guide.getByRole("button", { name: /ほかの考え方/ });
      const last = guide.getByText("当たり前を逆にしたらどうなる？", {
        exact: true,
      });
      expect(await last.isVisible()).toBe(false);
      await page.screenshot({ path: `${output}/after-writing-${width}.png` });
      await toggle.focus();
      await page.keyboard.press("Enter");
      expect(await toggle.getAttribute("aria-expanded")).toBe("true");
      await last.scrollIntoViewIfNeeded();
      expect(await last.isVisible()).toBe(true);
      await page.screenshot({
        path: `${output}/after-writing-expanded-${width}.png`,
      });
      await toggle.press("Space");
      expect(await last.isVisible()).toBe(false);
      await toggle.press("Tab");
      expect(
        await last.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  });

  test(`${width}px: 発想法の補足・選択カテゴリを閉じ直しても保持する`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await open(page, "room-boardhelppanel--expansion");
      const osborn = page.getByRole("tab", { name: "オズボーン", exact: true });
      await osborn.waitFor();
      await page.screenshot({ path: `${output}/after-expansion-${width}.png` });
      await osborn.focus();
      await page.keyboard.press("ArrowRight");
      const scamper = page.getByRole("tab", { name: "SCAMPER", exact: true });
      await vi.waitFor(async () =>
        expect(await scamper.getAttribute("aria-selected")).toBe("true"),
      );
      const last = page.getByText(
        "Reverse（逆転する）：順番や役割を逆にできないか？",
        { exact: true },
      );
      expect(await last.isVisible()).toBe(false);
      await scamper.press("Tab");
      // Radixのtabpanel自体もTabで辿れる。実際に操作対象へ移動する。
      const more = page.getByRole("button", { name: /ほかの問い/ });
      await more.focus();
      await page.keyboard.press("Enter");
      await last.scrollIntoViewIfNeeded();
      expect(await last.isVisible()).toBe(true);
      await page.screenshot({
        path: `${output}/after-expansion-expanded-${width}.png`,
      });
      await more.press("Escape");
      const reopen = page.getByRole("button", { name: "考えるヒントを開く" });
      expect(
        await reopen.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await reopen.press("Enter");
      expect(await scamper.getAttribute("aria-selected")).toBe("true");
      expect(await last.isVisible()).toBe(true);
      await page.getByRole("tab", { name: "書き出し", exact: true }).click();
      await page
        .getByRole("tab", { name: "発想を広げる", exact: true })
        .click();
      expect(await scamper.getAttribute("aria-selected")).toBe("true");
      expect(await last.isVisible()).toBe(true);
      for (const category of ["逆転発想", "他業界事例", "オズボーン"]) {
        await page.getByRole("tab", { name: category, exact: true }).click();
        const toggle = page.getByRole("button", { name: /ほかの問い/ });
        await toggle.press("Enter");
        expect(await toggle.getAttribute("aria-expanded")).toBe("true");
        await toggle.press("Space");
        expect(await toggle.getAttribute("aria-expanded")).toBe("false");
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  });

  test(`${width}px: 2-1はヒントを復活させず、3-1で短いヒントと付箋作成入口に届く`, async () => {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await open(page, "room-roomboardlayout--phase-2-step-1");
      await page.getByTestId("private-notes-toolbar").waitFor();
      expect(await page.getByTestId("board-help-panel").count()).toBe(0);
      expect(
        await page
          .getByTestId("private-notes-toolbar")
          .getAttribute("data-expanded"),
      ).toBe("true");
      await page.screenshot({ path: `${output}/after-phase-2-1-${width}.png` });
      await open(page, "room-roomboardlayout--phase-3-step-1");
      const help = page.getByTestId("board-help-panel");
      await page
        .getByRole("region", { name: "ファシリテーションガイド" })
        .press("Escape");
      await help.waitFor();
      await page.screenshot({
        path: `${output}/after-phase-3-1-initial-${width}.png`,
      });
      if (width < 640) {
        await help.getByRole("button", { name: "考えるヒントを開く" }).click();
      }
      const template = help.getByRole("button", {
        name: "もっと簡単に",
        exact: true,
      });
      await template.scrollIntoViewIfNeeded();
      await template.click({ trial: true });
      const box = await template.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `${output}/after-phase-3-1-templates-${width}.png`,
      });
    } finally {
      await page.close();
    }
  });
}
