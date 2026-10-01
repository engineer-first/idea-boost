import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

test("マップ四辺の外側もカーソルと名前を描画し、mapのclippingに隠れない", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--idea-map-margin-cursors&viewMode=story`,
    );
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    await plane.waitFor();
    const bounds = await plane.boundingBox();
    if (!bounds) throw new Error("マップがありません");
    for (const [index, name] of [
      "左余白",
      "右余白",
      "上余白",
      "下余白",
    ].entries()) {
      const label = page.getByText(name);
      const rect = await label.boundingBox();
      if (!rect) throw new Error("名前がありません");
      expect(
        await label.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          for (
            let parent = element.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if (
              style.overflowX !== "visible" &&
              (rect.left < bounds.left || rect.right > bounds.right)
            )
              return false;
            if (
              style.overflowY !== "visible" &&
              (rect.top < bounds.top || rect.bottom > bounds.bottom)
            )
              return false;
          }
          return true;
        }),
      ).toBe(true);
      if (index === 0) expect(rect.x + rect.width).toBeLessThan(bounds.x);
      if (index === 1) expect(rect.x).toBeGreaterThan(bounds.x + bounds.width);
      if (index === 2) expect(rect.y + rect.height).toBeLessThan(bounds.y);
      if (index === 3) expect(rect.y).toBeGreaterThan(bounds.y + bounds.height);
    }
  } finally {
    await browser.close();
  }
});
