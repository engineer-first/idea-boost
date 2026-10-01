import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test("初期82%でも軸名が14px以上相当で読め、平面や目盛りに重ならない", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--idea-map-initial-axes&viewMode=story`,
    );
    const map = page.getByTestId("idea-value-feasibility-map");
    await map.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await map.boundingBox();
    const plane = await page
      .getByTestId("idea-value-feasibility-map-plane")
      .boundingBox();
    if (!bounds || !plane) throw new Error("マップがありません");
    for (const axis of ["x", "y"]) {
      const label = page.getByTestId(
        `idea-value-feasibility-map-${axis}-axis-label`,
      );
      const fontSize = await label.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
      expect((fontSize * bounds.width) / 1600).toBeGreaterThanOrEqual(14);
      const rect = await label.boundingBox();
      if (!rect) throw new Error("軸名がありません");
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(
        bounds.y + bounds.height + 1,
      );
      if (axis === "y") expect(rect.x + rect.width).toBeLessThan(plane.x);
      else {
        const bar = await page
          .getByTestId("idea-value-feasibility-map-x-scale-bar")
          .boundingBox();
        expect(rect.y).toBeGreaterThan((bar?.y ?? 0) + (bar?.height ?? 0));
      }
    }
  } finally {
    await browser.close();
  }
});
