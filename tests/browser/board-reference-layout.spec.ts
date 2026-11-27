import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { sizes } from "./viewports";

// 左上の「決定した課題」「決定した問い」のカードは、マイ付箋の枠にも票の段にも重ならない。
const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function open(page: Page, id: string, testId: string) {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.getByTestId(testId).first().waitFor();
}
async function box(page: Page, testId: string) {
  const r = await page.getByTestId(testId).boundingBox();
  if (!r) throw new Error(`${testId}が表示されません`);
  return r;
}

test.each(
  sizes([1280, 800], [1180, 820]).flatMap(([width, height]) =>
    ["guide-phase-2-step-1", "guide-phase-3-step-1"].map(
      (story) => [width, height, story] as const,
    ),
  ),
)(
  "幅%d×%dの%sで、左上のカードがマイ付箋の枠の線にかからない",
  async (width, height, story) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await open(
        page,
        `room-roomboardview--${story}`,
        "board-context-references",
      );
      const frame = page.getByTestId("private-notes-toolbar");
      await frame.waitFor();
      await expect
        .poll(async () => {
          const references = await box(page, "board-context-references");
          const panel = await box(page, "private-notes-toolbar");
          // 横に離れているか、縦に離れていれば重ならない。
          return (
            panel.x >= references.x + references.width ||
            panel.y >= references.y + references.height
          );
        })
        .toBe(true);
    } finally {
      await page.close();
    }
  },
);

test("4行の長い課題でも、最後の行が票の段に隠れない", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await open(
      page,
      "room-boardcontext--long-issue-with-votes",
      "board-reference-issue-content",
    );
    const content = page.getByTestId("board-reference-issue-content");
    const lines = await content
      .locator("p")
      .evaluate((p) =>
        Math.round(
          p.getBoundingClientRect().height /
            parseFloat(getComputedStyle(p).lineHeight),
        ),
      );
    expect(lines).toBe(4);
    // 本文の欄の中に全行が収まり、スクロールしないと読めない行がない。
    const overflow = await content.evaluate(
      (node) => node.scrollHeight - node.clientHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await page.close();
  }
});
