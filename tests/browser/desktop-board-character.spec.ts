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
import { sizes } from "./viewports";

// 広い画面で先生の吹き出しが右上の操作（「◯-1に戻って書き足す」など）を隠さないこと（#1310）。
// 真下へ出すときも、上部中央のステップの道筋（現在地）を隠さないこと。
const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

// 共有一巡後（1-2）と、上部に戻る操作が並ぶ 2-2・3-2・3-3。
const STORIES = [
  "floating-timer-sharing-complete",
  "guide-phase-2-step-2",
  "guide-phase-3-step-2",
  "guide-phase-3-step-3",
] as const;

describe.each(sizes([1280, 800], [1024, 768], [768, 1024]))(
  "%i×%i",
  (width, height) => {
    test.each(STORIES)(
      "%s で先生の吹き出しが右上の操作とステップの道筋を隠さず、文言がはみ出さない",
      async (story) => {
        await page.setViewportSize({ width, height });
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story`,
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
        const controls = await box("board-control-hud");
        expect(overlaps(bubbleBox, controls)).toBe(false);
        // iPad 縦ではステップの道筋を出さない。
        if (await page.getByTestId("phase-step-trail").first().isVisible()) {
          const trail = await box("phase-step-trail");
          expect(overlaps(bubbleBox, trail)).toBe(false);
        }
        expect(
          await bubble.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
      },
    );
  },
);

// 個人で書く工程は吹き出しを書き込み欄へ重ねない。欄の位置は吹き出しの出入りで動かさない。
describe.each(sizes([1280, 800], [1024, 768], [768, 1024]))(
  "%i×%i",
  (width, height) => {
    test.each([1, 3])(
      "%i-1 で先生の吹き出しが書き込み欄に重ならない",
      async (phase) => {
        await page.setViewportSize({ width, height });
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardview--guide-phase-${phase}-step-1&viewMode=story`,
        );
        await page.getByTestId("board-control-hud").waitFor();
        await page.keyboard.press("Escape");
        await page.evaluate(() => document.fonts.ready);
        const bubble = page.getByTestId("board-character-bubble");
        await bubble.waitFor();
        await expect
          .poll(() =>
            bubble.evaluate((element) => getComputedStyle(element).transform),
          )
          .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
        await page.waitForTimeout(300);
        const bubbleBox = await box("board-character-bubble");
        const workspace = await box("private-notes-toolbar");
        expect(overlaps(bubbleBox, workspace)).toBe(false);
      },
    );
  },
);
