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
    const map = page.getByTestId("idea-map-viewport");
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
      expect(fontSize).toBe(axis === "y" ? 24 : 18);
      const layoutWidth = await map.evaluate(
        (element) => (element as HTMLElement).offsetWidth,
      );
      expect((fontSize * bounds.width) / layoutWidth).toBeGreaterThanOrEqual(
        14,
      );
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
        if (!bar) throw new Error("横軸の線がありません");
        expect(rect.y + rect.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
        expect(
          await label.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        ).not.toBe("rgba(0, 0, 0, 0)");
      }
    }
  } finally {
    await browser.close();
  }
});

// 固定マップの軸名はマップの広さに連動させず、従来のレスポンシブな文字サイズを保つ。
test.each([
  [390, "small"],
  [1280, "small"],
  [390, "large"],
  [1280, "large"],
] as const)("%ipx・%sマップで実現のしやすさが切れない", async (width, size) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--${size}-map-axis-reading&viewMode=story`,
    );
    const label = page.getByTestId("idea-value-feasibility-map-x-axis-label");
    await label.waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(await label.innerText()).toBe("実現のしやすさ");
    const initialFontSize = await label.evaluate((e) =>
      Number.parseFloat(getComputedStyle(e).fontSize),
    );
    expect(initialFontSize).toBe(width < 640 ? 16 : 18);
    expect(
      await page
        .getByRole("region", { name: "価値と実現のしやすさの2軸マップ" })
        .count(),
    ).toBe(1);
    expect(
      await page
        .getByRole("group", { name: "実現のしやすさ: 低から高" })
        .count(),
    ).toBe(1);

    // 個人用ズームは軸も含めて縮小する。CSSの文字サイズ自体は変えない。
    await page
      .getByRole("button", { name: "ズームを100%に戻す", exact: true })
      .click();
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole("button", { name: "キャンバスを縮小", exact: true })
        .click();
    }
    await expect
      .poll(() =>
        page
          .getByRole("button", { name: "ズームを100%に戻す", exact: true })
          .innerText(),
      )
      .toBe("51%");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const before = await label.boundingBox();
    if (!before) throw new Error("軸名がありません");
    await page.mouse.move(width / 2, 300);
    await page.mouse.wheel(
      before.x + before.width / 2 - width / 2,
      before.y + before.height / 2 - 600,
    );
    await expect
      .poll(async () => {
        const rect = await label.boundingBox();
        return (
          !!rect &&
          rect.x >= 0 &&
          rect.x + rect.width <= width &&
          rect.y >= 0 &&
          rect.y + rect.height < 800
        );
      })
      .toBe(true);
    const rect = await label.boundingBox();
    const plane = await page
      .getByTestId("idea-value-feasibility-map-plane")
      .boundingBox();
    if (!rect || !plane) throw new Error("マップがありません");
    const effectiveFontSize = await label.evaluate((e) => {
      if (!(e instanceof HTMLElement))
        throw new Error("軸名がHTML要素ではありません");
      const styles = getComputedStyle(e);
      return (
        (Number.parseFloat(styles.fontSize) * e.getBoundingClientRect().width) /
        e.offsetWidth
      );
    });
    const mapZoom = await page
      .getByTestId("idea-value-feasibility-map-plane")
      .evaluate((element) => {
        const map = element as HTMLElement;
        return map.getBoundingClientRect().width / map.offsetWidth;
      });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y).toBeGreaterThan(plane.y + plane.height);
    expect(rect.y + rect.height).toBeLessThan(800);
    expect(await label.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    const finalFontSize = Number.parseFloat(
      await label.evaluate((e) => getComputedStyle(e).fontSize),
    );
    expect(effectiveFontSize).toBeCloseTo(finalFontSize * mapZoom, 1);
    expect(finalFontSize).toBe(initialFontSize);
  } finally {
    await browser.close();
  }
});

test.each(
  [
    { phase: "3-2", story: "idea-map-workspace" },
    { phase: "3-3", story: "idea-map-only" },
    { phase: "3-4", story: "idea-map-voting" },
    { phase: "3-5", story: "idea-map-result" },
  ].flatMap((phase) => [390, 1280, 1440].map((width) => ({ ...phase, width }))),
)(
  "$phase / $width pxで軸名のサイズと中央配置を初回・リロード後で維持する",
  async ({ story, width }) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const readLayout = async () => {
        const map = page.getByTestId("idea-value-feasibility-map-plane");
        await map.waitFor();
        await page.evaluate(() => document.fonts.ready);
        const plane = await map.boundingBox();
        if (!plane) throw new Error("マップがありません");
        const labels = await Promise.all(
          ["x", "y"].map(async (axis) => {
            const label = page.getByTestId(
              `idea-value-feasibility-map-${axis}-axis-label`,
            );
            const bounds = await label.boundingBox();
            if (!bounds) throw new Error("軸名がありません");
            const fontSize = await label.evaluate((element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
            );
            expect(fontSize).toBe(
              axis === "y" ? (width < 640 ? 20 : 24) : width < 640 ? 16 : 18,
            );
            const center = {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
            };
            if (axis === "y") {
              const line = await page
                .getByTestId("idea-value-feasibility-map-y-scale-bar")
                .boundingBox();
              if (!line) throw new Error("縦軸の線がありません");
              expect(center.y).toBeCloseTo(line.y + line.height / 2, 0);
              expect(bounds.x + bounds.width).toBeLessThan(plane.x);
            } else {
              expect(center.x).toBeCloseTo(plane.x + plane.width / 2, 0);
              expect(bounds.y).toBeGreaterThanOrEqual(plane.y + plane.height);
              if (width >= 768) {
                const line = await page
                  .getByTestId("idea-value-feasibility-map-x-scale-bar")
                  .boundingBox();
                if (!line) throw new Error("横軸の線がありません");
                expect(center.y).toBeCloseTo(line.y + line.height / 2, 0);
              }
            }
            return { bounds, fontSize };
          }),
        );
        return { plane, labels };
      };
      await page.goto(
        `${origin}/iframe.html?id=room-roomboardview--${story}&viewMode=story`,
      );
      const initial = await readLayout();
      await page.reload();
      const reloaded = await readLayout();
      expect(reloaded).toEqual(initial);
    } finally {
      await browser.close();
    }
  },
);
