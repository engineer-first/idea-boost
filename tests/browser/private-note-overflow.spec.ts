import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

for (const width of widths(390, 1280)) {
  test.each([1, 2, 3])(
    `${width}px・%i-2: 個人付箋を横に動かさず、縦スクロールで末尾へ到達できる`,
    async (phase) => {
      page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-2&viewMode=story`,
      );
      const scroll = page.getByTestId("private-notes-scroll");
      await scroll.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const movement = await scroll.evaluate((element) => {
        element.scrollLeft = 100;
        element.scrollTop = element.scrollHeight;
        return {
          horizontal: element.scrollLeft,
          vertical: element.scrollTop,
        };
      });
      expect(movement.horizontal).toBe(0);
      expect(movement.vertical).toBeGreaterThan(0);
      const last = scroll.getByTestId("note-card").last();
      const note = await last.boundingBox();
      const area = await scroll.boundingBox();
      if (!note || !area) throw new Error("付箋または一覧がありません");
      expect(note.width).toBe(200);
      expect(note.x).toBeGreaterThanOrEqual(area.x);
      expect(note.x + note.width).toBeLessThanOrEqual(area.x + area.width);
      expect(note.y).toBeLessThan(area.y + area.height);
      expect(note.y + note.height).toBeLessThanOrEqual(area.y + area.height);
      expect(await page.getByTestId("private-notes-footer").count()).toBe(0);
    },
  );
}
