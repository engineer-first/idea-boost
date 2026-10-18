import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test.each(["height-boundary", "height-boundary-with-results"])(
  "%s: 基本高を越えても1行ぶんずつ伸び、本文を切らない",
  async (story) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(
        `${origin}/iframe.html?id=notes-notecard--${story}&viewMode=story`,
      );
      await page.getByTestId("note-card").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const measurements = await page
        .getByTestId("note-card")
        .evaluateAll((cards) =>
          cards.map((card) => {
            const textarea = card.querySelector("textarea");
            if (!textarea) throw new Error("本文がありません");
            return {
              height: card.getBoundingClientRect().height,
              textHeight: textarea.clientHeight,
              scrollHeight: textarea.scrollHeight,
              lineHeight: Number.parseFloat(
                getComputedStyle(textarea).lineHeight,
              ),
            };
          }),
        );
      for (let index = 0; index < measurements.length; index++) {
        const current = measurements[index];
        expect(current.scrollHeight).toBeLessThanOrEqual(
          current.textHeight + 1,
        );
        if (index % 4 !== 0) {
          expect(
            current.height - measurements[index - 1].height,
          ).toBeLessThanOrEqual(current.lineHeight);
        }
      }
    } finally {
      await browser.close();
    }
  },
);
