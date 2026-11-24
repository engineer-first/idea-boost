import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

for (const width of widths(390, 1440)) {
  test(`初回同期後も付箋追加の位置が動かない (${width}px)`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const positions: number[] = [];
      for (const state of ["connecting", "open"]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardview--${state === "open" ? "connected-empty" : "connecting"}&viewMode=story`,
        );
        const composer = page
          .getByTestId("private-notes-toolbar")
          .getByRole("textbox", { name: "付箋を書く" });
        await composer.waitFor();
        await page.evaluate(() => document.fonts.ready);
        positions.push((await composer.boundingBox())?.y ?? -1);
        expect(await composer.isDisabled()).toBe(state !== "open");
      }
      expect(positions[1]).toBeCloseTo(positions[0], 1);
    } finally {
      await page.close();
    }
  });
}

for (const width of widths(390, 1440)) {
  test.each(["auth-required", "unavailable", "connecting", "reconnecting"])(
    `ロビーの接続案内が参加者と招待欄に重ならない (${width}px, %s)`,
    async (state) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.goto(
          `${origin}/iframe.html?id=room-roomlobbyview--${state}&viewMode=story`,
        );
        const notice = page.getByTestId("lobby-connection-status");
        await notice.waitFor();
        await page.evaluate(() => document.fonts.ready);
        const noticeBox = await notice.boundingBox();
        const membersBox = await page.getByTestId("room-members").boundingBox();
        const cardBox = await page
          .getByTestId("room-lobby-view-invite")
          .boundingBox();
        if (!noticeBox || !membersBox || !cardBox)
          throw new Error("ロビーの要素が見つかりません");
        expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(
          membersBox.y,
        );
        expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(cardBox.y);
      } finally {
        await page.close();
      }
    },
  );
}

test("再接続中のドックが通知領域より下に収まる", async () => {
  const page = await browser.newPage({ viewport: { width: 768, height: 720 } });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--reconnecting-dock&viewMode=story`,
    );
    const notice = page.getByTestId("board-connection-status");
    const toolbar = page.getByTestId("private-notes-toolbar");
    await notice.waitFor();
    await toolbar.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const noticeBox = await notice.boundingBox();
    const dockBox = await toolbar.locator("..").boundingBox();
    if (!noticeBox || !dockBox) throw new Error("通知かドックが見つかりません");
    expect(dockBox.y).toBeGreaterThanOrEqual(noticeBox.y + noticeBox.height);
  } finally {
    await page.close();
  }
});
