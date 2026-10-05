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

// #536: 文言が長くなっても既存の軸サイズを保ち、カメラ移動で全文を読める。
test.each([
  [390, "small", 48],
  [1280, "small", 48],
  [390, "large", 87],
  [1280, "large", 87],
] as const)("%ipx・%sマップで実現のしやすさが切れない", async (width, size, fontSize) => {
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
    expect(await label.evaluate((e) => getComputedStyle(e).fontSize)).toBe(
      `${fontSize}px`,
    );
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

    // 本人の表示操作のみで縮小し、共有のマップ寸法・文字サイズは変えない。
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
    expect(effectiveFontSize).toBeGreaterThanOrEqual(24);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y).toBeGreaterThan(plane.y + plane.height);
    expect(rect.y + rect.height).toBeLessThan(800);
    expect(await label.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    expect(await label.evaluate((e) => getComputedStyle(e).fontSize)).toBe(
      `${fontSize}px`,
    );
  } finally {
    await browser.close();
  }
});
