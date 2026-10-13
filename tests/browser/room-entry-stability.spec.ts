import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

for (const width of [390, 1440]) {
  test(`接続案内の切替でロビーの見出しとカードが動かない (${width}px)`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const positions: { heading: number; card: number }[] = [];
      for (const state of ["connecting", "open", "closed"]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomlobbyview--${state === "open" ? "connected" : state === "closed" ? "reconnecting" : "connecting"}&viewMode=story`,
        );
        await page.getByTestId("room-lobby-view").waitFor();
        await page.evaluate(() => document.fonts.ready);
        positions.push({
          heading:
            (
              await page
                .getByRole("heading", { name: "メンバーを集めて開始" })
                .boundingBox()
            )?.y ?? -1,
          card:
            (await page.getByTestId("room-lobby-view-invite").boundingBox())
              ?.y ?? -1,
        });
        expect(await page.getByTestId("start-phase-button").isDisabled()).toBe(
          state !== "open",
        );
      }
      for (const position of positions) {
        expect(position.heading).toBeCloseTo(positions[0].heading, 1);
        expect(position.card).toBeCloseTo(positions[0].card, 1);
      }
    } finally {
      await page.close();
    }
  });

  test(`初回同期後も付箋追加の位置が動かない (${width}px)`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const positions: number[] = [];
      for (const state of ["connecting", "open"]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardview--${state === "open" ? "connected-empty" : "connecting"}&viewMode=story`,
        );
        const add = page.getByRole("button", {
          name: "付箋を追加",
          exact: true,
        });
        await add.waitFor();
        await page.evaluate(() => document.fonts.ready);
        positions.push((await add.boundingBox())?.y ?? -1);
        expect(await add.isDisabled()).toBe(state !== "open");
      }
      expect(positions[1]).toBeCloseTo(positions[0], 1);
    } finally {
      await page.close();
    }
  });
}
