import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function open(page: Page, story: string): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-boardhelppanel--${story}&viewMode=story`,
  );
  await page.getByTestId("board-help-panel").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [390, 1440]) {
  test(`${width}pxで選んだ発想法を保ち、キーボードで作業へ戻れる`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await open(page, "expansion");
      const osborn = page.getByRole("tab", { name: "オズボーン", exact: true });
      await osborn.focus();
      await osborn.press("ArrowRight");
      const scamper = page.getByRole("tab", { name: "SCAMPER", exact: true });
      await scamper.waitFor();
      await vi.waitFor(async () => {
        expect(await scamper.getAttribute("aria-selected")).toBe("true");
      });
      const tools = page.getByRole("tablist", { name: "発想法" });
      const panel = page.getByRole("tabpanel").filter({ has: tools });
      expect(await panel.getByRole("button").count()).toBe(0);
      const last = page.getByText(
        "Reverse（逆転する）：順番や役割を逆にできないか？",
        { exact: true },
      );
      await last.scrollIntoViewIfNeeded();
      expect(await last.isVisible()).toBe(true);
      await scamper.press("Escape");
      const toggle = page.getByRole("button", { name: "考えるヒントを開く" });
      expect(await toggle.evaluate((el) => el === document.activeElement)).toBe(
        true,
      );
      expect(await page.getByRole("tab", { name: "SCAMPER" }).count()).toBe(0);
      await toggle.press("Tab");
      expect(
        await page
          .getByTestId("board-help-panel")
          .evaluate((el) => el.contains(document.activeElement)),
      ).toBe(false);
      await toggle.press("Enter");
      await vi.waitFor(async () => {
        expect(await scamper.getAttribute("aria-selected")).toBe("true");
      });
      await page.getByRole("tab", { name: "書き出し", exact: true }).click();
      expect(await page.getByRole("tab", { name: "SCAMPER" }).count()).toBe(0);
      await page
        .getByRole("tab", { name: "発想を広げる", exact: true })
        .click();
      await vi.waitFor(async () => {
        expect(await scamper.getAttribute("aria-selected")).toBe("true");
      });
      for (const [label, title] of [
        ["逆転発想", "逆転発想で考える"],
        ["他業界事例", "他業界からヒントを探す"],
        ["オズボーン", "オズボーンのチェックリスト"],
      ]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        expect(
          await page.getByRole("heading", { name: title }).isVisible(),
        ).toBe(true);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      await page.close();
    }
  });
}

test("接続拒否中は発想支援ツールを作成できない", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await open(page, "disconnected");
    const guide = page.getByTestId("idea-guide-panel");
    for (const button of await guide.getByRole("button").all()) {
      expect(await button.isDisabled()).toBe(true);
    }
  } finally {
    await page.close();
  }
});
