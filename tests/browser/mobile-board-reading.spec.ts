import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { includeMobile } from "./viewports";

// スマホ縦で招待から入った参加者が、ボードを見るだけで今のステップと残り時間を追えること（#1289）。
const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  page.setDefaultTimeout(5000);
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

type Box = { x: number; y: number; width: number; height: number };
async function box(testId: string): Promise<Box> {
  const target = page.getByTestId(testId).first();
  await target.waitFor();
  const value = await target.boundingBox();
  expect(value, testId).not.toBeNull();
  return value as Box;
}
function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

// 個人作業（各フェーズの Step 1）は入力欄との配置を別の検査で確かめる。
const STEPS: [phase: number, step: number][] = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 2],
  [2, 3],
  [2, 4],
  [3, 2],
  [3, 3],
  [3, 4],
  [3, 5],
];

// 全サイズがスマホ幅なので、スマホ幅を回さない実行では空の suite にせず skip として残す。
describe.skipIf(!includeMobile).each([
  [360, 740],
  [430, 932],
])("%i×%i", (width, height) => {
  test.each(STEPS)(
    "フェーズ%i Step %i で先生の吹き出しが現在地・決定事項・タイマーを隠さない",
    async (phase, step) => {
      await page.setViewportSize({ width, height });
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--guide-phase-${phase}-step-${step}&viewMode=story`,
      );
      await page.getByTestId("board-control-hud").waitFor();
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.fonts.ready);
      const bubble = page.getByTestId("board-character-bubble");
      await bubble.waitFor();
      // 登場の拡大が終わってから測る。
      await expect
        .poll(() =>
          bubble.evaluate((element) => getComputedStyle(element).transform),
        )
        .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      await page.waitForTimeout(300);
      const bubbleBox = await box("board-character-bubble");
      const characterBox = await box("board-character");
      for (const testId of ["board-location-card", "timer-floating"]) {
        const other = await box(testId);
        expect(overlaps(bubbleBox, other), testId).toBe(false);
        expect(overlaps(characterBox, other), testId).toBe(false);
      }
      const references = page.getByTestId("board-context-references");
      if (await references.count()) {
        const other = await box("board-context-references");
        expect(overlaps(bubbleBox, other), "references").toBe(false);
        expect(overlaps(characterBox, other), "references").toBe(false);
      }
      const timer = await box("timer-floating");
      expect(timer.x).toBeGreaterThanOrEqual(0);
      expect(timer.x + timer.width).toBeLessThanOrEqual(width);
      expect(timer.y + timer.height).toBeLessThanOrEqual(height);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    },
  );
});
