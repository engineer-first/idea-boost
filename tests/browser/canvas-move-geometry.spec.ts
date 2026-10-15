import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
async function centers(page: Page) {
  return page.evaluate(() =>
    [1, 2, 3].map((index) => {
      const id = `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`;
      const element = document.querySelector(`[data-note-id="${id}"]`);
      if (!element) throw new Error("fixture note missing");
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }),
  );
}

test("map端の固定3枚を同じ画面deltaでpreview/確定し相対距離を維持する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--transaction-move-100-map-notes&viewMode=story&args=ackDelayMs:0`,
    );
    await page.getByTestId("idea-value-feasibility-map").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
    for (let i = 0; i < 7; i++)
      await page
        .getByRole("button", { name: "キャンバスを縮小", exact: true })
        .click();
    await page.waitForFunction(() =>
      document
        .querySelector<HTMLElement>('[data-testid="board-canvas"]')
        ?.style.transform.includes("scale(0.209715"),
    );
    const note = page
      .locator('[data-note-id="00000001-0000-4000-8000-000000000000"]')
      .first();
    const box = await note
      .getByRole("button", { name: "付箋", exact: true })
      .boundingBox();
    if (!box) throw new Error("fixture note missing");
    const before = await centers(page);
    const camera = await page.getByTestId("board-canvas").getAttribute("style");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 24,
      box.y + box.height * 0.9,
      { steps: 4 },
    );
    await expect
      .poll(async () => (await centers(page))[1].x - before[1].x)
      .toBeGreaterThan(10);
    const preview = await centers(page);
    expect(await page.getByTestId("board-canvas").getAttribute("style")).toBe(
      camera,
    );
    for (const [index, center] of preview.entries()) {
      expect(center.x - before[index].x).toBeCloseTo(
        preview[0].x - before[0].x,
        1,
      );
      expect(center.y - before[index].y).toBeCloseTo(
        preview[0].y - before[0].y,
        1,
      );
    }
    await page.mouse.up();
    await expect.poll(async () => await centers(page)).toEqual(preview);
  } finally {
    await page.close();
  }
});
