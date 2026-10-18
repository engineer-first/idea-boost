import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test.each([390, 1280])(
  "%ipx: 表示中も編集中も本文が左右の余白まで使える",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.goto(
        `${origin}/iframe.html?id=notes-notecard--right-edge-content&viewMode=story&args=isSelected:true`,
      );
      const card = page.getByTestId("note-card");
      const textarea = card.locator("textarea");
      await textarea.waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const editing of [false, true]) {
        if (editing) {
          await card.getByRole("button", { name: "付箋", exact: true }).click();
          expect(await textarea.getAttribute("readonly")).toBeNull();
        }
        const dimensions = await textarea.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            textWidth:
              element.clientWidth -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight),
            height: element.clientHeight,
            scrollHeight: element.scrollHeight,
          };
        });
        // 幅200pxの付箋では左右8pxを除く184pxまで本文が使える。
        expect(dimensions.textWidth).toBe(184);
        expect(dimensions.scrollHeight).toBeLessThanOrEqual(
          dimensions.height + 1,
        );
      }
    } finally {
      await browser.close();
    }
  },
);

test.each([390, 1280])(
  "%ipx: 折り返した本文を票・決定マークが覆わない",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(
        `${origin}/iframe.html?id=notes-notecard--text-width-boundary&viewMode=story`,
      );
      await page.getByTestId("note-card").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const measurements = await page
        .getByTestId("note-card")
        .evaluateAll((cards) =>
          cards.map((card) => {
            const textarea = card.querySelector("textarea");
            if (!textarea) throw new Error("本文がありません");
            const textStyle = getComputedStyle(textarea);
            const textBottom =
              textarea.getBoundingClientRect().bottom -
              Number.parseFloat(textStyle.paddingBottom);
            const result = card.querySelector(
              '[data-testid="note-vote-results"]',
            );
            const decision = card.querySelector(
              '[aria-label="取り組む課題に決定済み"]',
            );
            return {
              textWidth:
                textarea.clientWidth -
                Number.parseFloat(textStyle.paddingLeft) -
                Number.parseFloat(textStyle.paddingRight),
              height: textarea.clientHeight,
              scrollHeight: textarea.scrollHeight,
              textBottom,
              resultTop: result?.getBoundingClientRect().top,
              decisionTop: decision?.getBoundingClientRect().top,
            };
          }),
        );
      expect(measurements).toHaveLength(9);
      for (const measurement of measurements) {
        expect(measurement.textWidth).toBe(184);
        expect(measurement.scrollHeight).toBeLessThanOrEqual(
          measurement.height + 1,
        );
        if (measurement.resultTop !== undefined)
          expect(measurement.resultTop).toBeGreaterThanOrEqual(
            measurement.textBottom,
          );
        if (measurement.decisionTop !== undefined)
          expect(measurement.decisionTop).toBeGreaterThanOrEqual(
            measurement.textBottom,
          );
      }
    } finally {
      await browser.close();
    }
  },
);
