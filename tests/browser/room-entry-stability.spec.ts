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
                .getByRole("heading", { name: "メンバーが揃ったら開始" })
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

for (const width of [390, 1440]) {
  test.each([
    "auth-required",
    "unavailable",
    "delayed-connecting",
    "delayed-reconnecting",
  ])(`ロビーの長い接続案内が説明とカードに重ならない (${width}px, %s)`, async (state) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(
        `${origin}/iframe.html?id=room-roomlobbyview--${state}&viewMode=story`,
      );
      const notice = page.locator("header").getByRole("status");
      await notice.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const noticeBox = await notice.boundingBox();
      const privacyBox = await page
        .getByText(
          "途中の共有盤面・公開済みの合計票・進行時刻と、完了した成果は自動保存されます。",
          { exact: false },
        )
        .boundingBox();
      const cardBox = await page
        .getByTestId("room-lobby-view-invite")
        .boundingBox();
      if (!noticeBox || !privacyBox || !cardBox)
        throw new Error("ロビーの要素が見つかりません");
      expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(privacyBox.y);
      expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(cardBox.y);
    } finally {
      await page.close();
    }
  });
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
