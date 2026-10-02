import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

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

test.each([390, 1440])(
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
    expect(await explanation.innerText()).toContain("全員に反映");
    expect(await explanation.innerText()).toContain("表示倍率は自分だけ");
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
    const map = page.getByTestId("idea-value-feasibility-map");
    const previousWidth = await map.evaluate((element) => element.style.width);
    const camera = await page.getByTestId("board-canvas").getAttribute("style");
    await page.getByRole("button", { name: "マップを広くする" }).click();
    await expect
      .poll(() => map.evaluate((element) => element.style.width))
      .not.toBe(previousWidth);
    expect(await page.getByTestId("board-canvas").getAttribute("style")).toBe(
      camera,
    );
    await page.getByRole("button", { name: "マップを狭くする" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => map.evaluate((element) => element.style.width))
      .toBe(previousWidth);
  },
);

test.each([
  ["participant-cannot-adjust", "ホストだけ"],
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
  expect(await explanation.innerText()).toContain(reason);
  await page.screenshot({ path: `${output}/help-${story}.png` });
  await page.keyboard.press("Escape");
  await expect
    .poll(() => help.evaluate((element) => element === document.activeElement))
    .toBe(true);
});
