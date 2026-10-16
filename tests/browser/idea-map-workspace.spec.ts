import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = "test-results/idea-map-workspace";
let browser: Browser;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function openWorkspace(page: Page, expandTray = true): Promise<void> {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--idea-map-workspace&viewMode=story`,
  );
  await page.getByTestId("idea-map-fixed-position-area").waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (expandTray)
    await page
      .getByRole("button", { name: "未配置の案を開く", exact: true })
      .click();
}

test.each([
  { width: 1280, height: 720 },
  { width: 1440, height: 1000 },
])("$width×$heightでマップの高さを確保し、未配置一覧を右に収める", async (viewport) => {
  const page = await browser.newPage({ viewport });
  try {
    await openWorkspace(page);
    const plane = await page
      .getByTestId("idea-value-feasibility-map-plane")
      .boundingBox();
    const tray = await page.getByTestId("idea-map-unplaced-tray").boundingBox();
    const controls = await page.getByTestId("board-control-hud").boundingBox();
    const header = await page.getByTestId("board-header-row").boundingBox();
    if (!plane || !tray || !controls || !header)
      throw new Error("評価画面がありません");
    const valueScale = page.getByRole("group", {
      name: "価値: 低から高",
    });
    const high = await valueScale
      .getByText("高", { exact: true })
      .boundingBox();
    const low = await valueScale.getByText("低", { exact: true }).boundingBox();
    if (!high || !low) throw new Error("縦軸の目盛りがありません");

    expect(plane.height).toBeGreaterThanOrEqual(viewport.height * 0.55);
    expect(plane.width / plane.height).toBeCloseTo(9 / 5, 1);
    expect(low.y - high.y).toBeGreaterThan(plane.height * 0.7);
    expect(plane.y).toBeGreaterThanOrEqual(header.y + header.height + 8);
    expect(header.height).toBeLessThan(150);
    expect(
      await page
        .getByTestId("board-header-row")
        .evaluate((element) => getComputedStyle(element).position),
    ).toBe("absolute");
    expect(tray.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    expect(tray.x).toBeGreaterThanOrEqual(plane.x + plane.width);
    expect(tray.y + tray.height).toBeLessThanOrEqual(viewport.height);
    expect(tray.x + tray.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page
        .getByTestId("idea-map-unplaced-scroll")
        .evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe("auto");
    expect(await page.getByTestId("board-operation-matrix").count()).toBe(1);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);

    await page.screenshot({
      path: `${output}/workspace-${viewport.width}.png`,
    });
  } finally {
    await page.close();
  }
});

test("右側の一覧だけをスクロールし、参照情報やガイドを開いてもマップが動かない", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const before = await plane.boundingBox();
    await page
      .getByRole("button", { name: "未配置の案を閉じる", exact: true })
      .click();
    expect(await plane.boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "未配置の案を開く", exact: true })
      .click();
    expect(await plane.boundingBox()).toEqual(before);
    const scroll = page.getByTestId("idea-map-unplaced-scroll");
    await scroll.hover();
    await page.mouse.wheel(0, 1200);
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await plane.boundingBox()).toEqual(before);

    const question = page.getByRole("button", {
      name: /決定した問い/,
    });
    expect(await question.getAttribute("aria-expanded")).toBe("false");
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("true");
    await page.getByLabel("決定した問いの本文").waitFor();
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("false");
    expect(await plane.boundingBox()).toEqual(before);
    await question.click();
    expect(await question.getAttribute("aria-expanded")).toBe("true");
    expect(await plane.boundingBox()).toEqual(before);

    await page.getByRole("button", { name: "進め方", exact: true }).click();
    expect(await plane.boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    expect(
      await page.getByTestId("step-guide").getAttribute("data-state"),
    ).toBe("compact");
  } finally {
    await page.close();
  }
});

test("右の一覧から配置・戻しができ、画面幅を変えても評価座標を保持する", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await openWorkspace(page);
    const id = "map-workspace-unplaced-1";
    const source = page.getByTestId(`idea-map-tray-note-${id}`);
    const area = await page
      .getByTestId("idea-map-fixed-position-area")
      .boundingBox();
    const start = await source
      .getByRole("button", { name: "付箋", exact: true })
      .boundingBox();
    if (!start || !area) throw new Error("移動する付箋がありません");
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x - 15, start.y + 20, { steps: 3 });
    await page.mouse.move(
      area.x + area.width * 0.45,
      area.y + area.height * 0.45,
      { steps: 10 },
    );
    await page.mouse.up();

    const placed = page.getByTestId(`idea-value-feasibility-map-note-${id}`);
    await placed.waitFor();
    expect(await source.count()).toBe(0);
    const position = await placed.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      bottom: (element as HTMLElement).style.bottom,
    }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(
      await placed.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        bottom: (element as HTMLElement).style.bottom,
      })),
    ).toEqual(position);

    const current = await placed
      .getByRole("button", { name: "付箋", exact: true })
      .boundingBox();
    const tray = await page.getByTestId("idea-map-unplaced-tray").boundingBox();
    if (!current || !tray) throw new Error("戻し先がありません");
    await page.mouse.move(current.x + 20, current.y + 20);
    await page.mouse.down();
    await page.mouse.move(current.x + 40, current.y + 20, { steps: 3 });
    await page.mouse.move(tray.x + tray.width / 2, tray.y + 160, { steps: 10 });
    await page.mouse.up();
    await source.waitFor();
    expect(await placed.count()).toBe(0);
    await page.screenshot({ path: `${output}/placed-and-returned.png` });
  } finally {
    await page.close();
  }
});

test.each([
  320, 390,
])("%ipxでは一覧を畳んでマップの幅を確保し、一覧を開閉できる", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  try {
    await openWorkspace(page, false);
    const plane = page.getByTestId("idea-value-feasibility-map-plane");
    const before = await plane.boundingBox();
    if (!before) throw new Error("評価マップがありません");
    expect(before.width).toBeGreaterThan(width * 0.65);
    expect(before.width / before.height).toBeCloseTo(9 / 5, 1);
    await page
      .getByRole("button", { name: "未配置の案を開く", exact: true })
      .click();
    const firstNote = page.getByTestId(
      "idea-map-tray-note-map-workspace-unplaced-1",
    );
    expect(await firstNote.isVisible()).toBe(true);
    expect(await plane.boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "未配置の案を閉じる", exact: true })
      .click();
    expect(await firstNote.isVisible()).toBe(false);
    expect(await plane.boundingBox()).toEqual(before);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({ path: `${output}/workspace-${width}.png` });
  } finally {
    await page.close();
  }
});
