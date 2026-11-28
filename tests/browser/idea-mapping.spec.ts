import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { includeMobile, widths } from "./viewports";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = process.env.U09_EVIDENCE_DIR ?? "test-results/idea-mapping";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

test.each(widths(390, 1440))(
  "%spxで共有範囲を説明し、通常pointerとkeyboardから操作できる",
  async (width) => {
    page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardlayout--map-controls&viewMode=story`,
    );
    const help = page.getByRole("button", { name: "マップの広さについて" });
    await help.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const controls = await page
      .getByTestId("idea-map-size-controls")
      .boundingBox();
    const zoom = await page.getByTestId("canvas-zoom-controls").boundingBox();
    if (!controls || !zoom) throw new Error("マップと表示操作が見つかりません");
    expect(controls.x).toBeGreaterThanOrEqual(0);
    expect(controls.x + controls.width).toBeLessThanOrEqual(width);
    expect(
      controls.x >= zoom.x + zoom.width ||
        controls.y + controls.height <= zoom.y,
    ).toBe(true);
    await page.screenshot({ path: `${output}/after-controls-${width}.png` });
    await help.click();
    const explanation = page.getByRole("dialog", {
      name: "マップの広さについて",
    });
    await explanation.waitFor();
    await expect
      .poll(() =>
        explanation.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    expect(await explanation.textContent()).toContain("全員に反映");
    expect(await explanation.textContent()).toContain(
      "個人用ズームは表示範囲と独立しており、自分だけの見え方を調整します。",
    );
    const bounds = await explanation.boundingBox();
    if (!bounds) throw new Error("広さの説明が見つかりません");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `${output}/after-help-${width}.png` });
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        help.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    const map = page.getByTestId("idea-value-feasibility-map-plane");
    const note = page
      .getByTestId("idea-value-feasibility-map-note-note-1")
      .getByTestId("note-card");
    const initialMapBounds = await map.boundingBox();
    const initialNoteBounds = await note.boundingBox();
    if (!initialMapBounds || !initialNoteBounds)
      throw new Error("2軸マップまたは付箋が見つかりません");
    // マップを広げても付箋の大きさは変えない。マップ全体が見えるよう表示を合わせ直すので、
    // 付箋は小さく見え、マップの中の相対位置（評価値）は変わらない。
    const relativeCenter = (
      note: { x: number; y: number; width: number; height: number },
      plane: { x: number; y: number; width: number; height: number },
    ) => ({
      x: (note.x + note.width / 2 - plane.x) / plane.width,
      y: (note.y + note.height / 2 - plane.y) / plane.height,
    });
    const initialRelative = relativeCenter(initialNoteBounds, initialMapBounds);
    await page.getByRole("button", { name: "マップを広くする" }).click();
    // 広げたマップが画面に入りきらなくなる幅だけ、表示を縮めて付箋が小さく見える。
    await expect
      .poll(async () => (await map.boundingBox())?.width ?? 0)
      .not.toBe(initialMapBounds.width);
    expect((await note.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(
      initialNoteBounds.width,
    );
    await expect
      .poll(async () => {
        const noteBounds = await note.boundingBox();
        const mapBounds = await map.boundingBox();
        if (!noteBounds || !mapBounds) return Number.POSITIVE_INFINITY;
        const relative = relativeCenter(noteBounds, mapBounds);
        return Math.max(
          Math.abs(relative.x - initialRelative.x),
          Math.abs(relative.y - initialRelative.y),
        );
      })
      .toBeLessThan(0.01);
    await page.getByRole("button", { name: "マップを狭くする" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await note.boundingBox())?.width ?? 0)
      .toBeCloseTo(initialNoteBounds.width, 0);
    await expect
      .poll(async () => (await map.boundingBox())?.width ?? 0)
      .toBeCloseTo(initialMapBounds.width, 0);
  },
);

test.skipIf(!includeMobile).each([
  ["initializing", "準備"],
  ["disconnected", "接続が回復"],
  ["dragging-blocked", "ドラッグ中"],
])("%sでも説明を開いて変更できない理由を読める", async (story, reason) => {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(
    `${origin}/iframe.html?id=room-ideamapsizecontrols--${story}&viewMode=story`,
  );
  const help = page.getByRole("button", { name: "マップの広さについて" });
  await help.waitFor();
  expect(
    await page.getByRole("button", { name: "マップを広くする" }).isDisabled(),
  ).toBe(true);
  await help.focus();
  await page.keyboard.press("Enter");
  const explanation = page.getByRole("dialog", {
    name: "マップの広さについて",
  });
  await explanation.waitFor();
  await expect
    .poll(() =>
      explanation.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  expect(await explanation.textContent()).toContain(reason);
  await page.screenshot({ path: `${output}/help-${story}.png` });
  await page.keyboard.press("Escape");
  await expect
    .poll(() => help.evaluate((element) => element === document.activeElement))
    .toBe(true);
});

test.each(widths(390, 1440))(
  "%spxの参加者もマップを閲覧して広さを変更できる",
  async (width) => {
    page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(
      `${origin}/iframe.html?id=room-roomboardcanvas--participant-idea-map&viewMode=story`,
    );
    await page.getByTestId("idea-value-feasibility-map-plane").waitFor();
    expect(await page.getByTestId("idea-map-size-controls-hud").count()).toBe(
      1,
    );
    expect(
      await page.getByRole("group", { name: "2軸マップの広さ操作" }).count(),
    ).toBe(1);
    expect(
      await page.getByRole("button", { name: "マップの広さについて" }).count(),
    ).toBe(1);
  },
);
