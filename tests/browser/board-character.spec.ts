import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
  await mkdir("test-results/board-layout", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});

async function reachable(page: Page): Promise<void> {
  const character = page.getByRole("button", {
    name: "直前の一言をもう一度見る",
  });
  await character.click({ trial: true });
  const box = await character.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  expect(box?.x).toBeLessThanOrEqual(16);
  // 左上の現在地カードのすぐ下に置く。
  const location = await page.getByTestId("board-location-card").boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(
    (location?.y ?? 0) + (location?.height ?? 0),
  );
  expect(box?.y).toBeLessThanOrEqual(
    (location?.y ?? 0) + (location?.height ?? 0) + 24,
  );
  const bubble = page.getByTestId("board-character").getByRole("status");
  if (await bubble.isVisible()) {
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox?.y).toBeGreaterThanOrEqual(0);
    expect(bubbleBox?.x).toBeGreaterThanOrEqual(
      (box?.x ?? 0) + (box?.width ?? 0),
    );
    expect((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  }
  const zoom = page.getByTestId("canvas-zoom-hud");
  if (await zoom.isVisible()) {
    const zoomBox = await zoom.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(zoomBox?.y ?? 0);
  }
}

test.each([
  [1280, 720],
  [390, 844],
  [320, 568],
])(
  "%i×%iで個人・共有・評価中の先生と操作ボタンへ届く",
  async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(15_000);
    try {
      for (const [phase, step] of [
        [1, 1],
        [1, 2],
        [3, 3],
      ]) {
        await page.goto(
          `${origin}/iframe.html?id=room-roomboardlayout--phase-${phase}-step-${step}&viewMode=story`,
        );
        await page.getByTestId("board-character").waitFor();
        await page.keyboard.press("Escape");
        await reachable(page);
        await page.screenshot({
          path: `test-results/board-layout/character-${width}-${phase}-${step}.png`,
        });
      }
    } finally {
      await page.close();
    }
  },
);

test("残り時間の一言が自動で消え、先生を押すと再表示できる", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.clock.install();
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--phase-1-step-2&viewMode=story`,
    );
    const character = page.getByTestId("board-character");
    await character.waitFor();
    await page.clock.fastForward(110_000);
    expect(await character.getByRole("status").textContent()).toContain(
      "残り30秒",
    );
    await page.screenshot({
      path: "test-results/board-layout/character-bubble.png",
    });
    await page.clock.fastForward(8_000);
    expect(await character.getByRole("status").count()).toBe(0);
    await character.getByRole("button").click();
    expect(await character.getByRole("status").textContent()).toContain(
      "残り30秒",
    );
  } finally {
    await page.close();
  }
});
