import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const output = process.env.U07_EVIDENCE_DIR ?? "test-results/note-reading";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--interactive-note-reading&viewMode=story`,
  );
  await page.getByTestId("note-card").waitFor();
  await page.evaluate(() => document.fonts.ready);
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

test("長文の編集を終えて全体表示しても、フォーカスがカメラ以外の視野を動かさない", async () => {
  const card = page.getByTestId("note-card");
  // 下端に一部だけ見える付箋を通常pointerで選ぶ。locator.clickの自動scrollは使わない。
  const initial = await card.boundingBox();
  if (!initial) throw new Error("付箋が見つかりません");
  await page.mouse.move(initial.x + 100, initial.y + 20);
  await page.mouse.wheel(0, -200);
  await expect
    .poll(async () => (await card.boundingBox())?.y)
    .toBeGreaterThan(initial.y + 190);
  const panned = await card.boundingBox();
  if (!panned) throw new Error("パン後の付箋が見つかりません");
  await page.mouse.click(panned.x + 100, panned.y + 20);
  await page.keyboard.press("Enter");
  await card.locator("textarea:not([readonly])").waitFor();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    `${"長文を読む。\n".repeat(300).slice(0, 1998)}末尾`,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "付箋全体を表示" }).click();
  await page.screenshot({
    path: `${output}/${process.env.U07_CAPTURE_STAGE ?? "after"}-long-fit.png`,
  });
  expect(
    await page.getByTestId("board-scroller").evaluate((element) => ({
      top: element.scrollTop,
      left: element.scrollLeft,
    })),
  ).toEqual({ top: 0, left: 0 });
  const bounds = await card.boundingBox();
  const viewport = await page.getByTestId("board-scroller").boundingBox();
  expect(bounds?.y).toBeGreaterThanOrEqual(viewport?.y ?? 0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
    (viewport?.y ?? 0) + (viewport?.height ?? 0),
  );
});

test.each([1280, 390])(
  "%ipx: 選択付箋からSpace＋dragでパンし、本文や編集状態を変えない",
  async (width) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "付箋全体を表示" }).click();
    const card = page.getByTestId("note-card");
    const bounds = await card.boundingBox();
    if (!bounds) throw new Error("付箋が見つかりません");
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 30);
    const before = await page.getByTestId("board-canvas").getAttribute("style");
    await page.keyboard.down("Space");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + 90, {
      steps: 4,
    });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect
      .poll(() => page.getByTestId("board-canvas").getAttribute("style"))
      .not.toBe(before);
    expect(await card.locator("textarea").inputValue()).toBe("読む本文");
    expect(
      await card.locator("textarea").getAttribute("readonly"),
    ).not.toBeNull();
    expect(await card.getAttribute("data-editing")).toBeNull();
  },
);

test.each([1280, 390])(
  "%ipx: 最大長を12〜24pxで読み、ズーム・キーボードで視野を回復する",
  async (width) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "付箋全体を表示" }).click();
    const card = page.getByTestId("note-card");
    await card.getByRole("button", { name: "付箋", exact: true }).dblclick();
    await card.locator("textarea:not([readonly])").waitFor();
    const content = `${"全文を順に読む。".repeat(250).slice(0, 1998)}末尾`;
    await card.locator("textarea").fill(content);
    await page.keyboard.press("Escape");
    for (let i = 14; i > 12; i--) {
      await page.getByRole("button", { name: "付箋の文字を小さく" }).click();
    }
    for (const fontSize of [12, 24]) {
      if (fontSize === 24) {
        for (let i = 12; i < 24; i++) {
          await page
            .getByRole("button", { name: "付箋の文字を大きく" })
            .click();
        }
      }
      await expect
        .poll(() =>
          card
            .locator("textarea")
            .evaluate((element) => getComputedStyle(element).fontSize),
        )
        .toBe(`${fontSize}px`);
      const dimensions = await card.locator("textarea").evaluate((element) => ({
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(dimensions.scrollHeight).toBeLessThanOrEqual(
        dimensions.height + 1,
      );
      expect(await card.locator("textarea").inputValue()).toBe(content);
    }
    await page.getByRole("button", { name: "付箋全体を表示" }).click();
    await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
    await expect
      .poll(async () => (await card.boundingBox())?.width)
      .toBeCloseTo(200, 0);
    const board = page.getByTestId("board-scroller");
    await page.getByRole("button", { name: "ズームを100%に戻す" }).focus();
    const previous = await page
      .getByTestId("board-canvas")
      .getAttribute("style");
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => page.getByTestId("board-canvas").getAttribute("style"))
      .not.toBe(previous);
    const viewport = await board.boundingBox();
    const note = await card.boundingBox();
    if (!viewport || !note) throw new Error("読書領域が見つかりません");
    await page.mouse.move(
      viewport.x + viewport.width / 2,
      viewport.y + viewport.height / 2,
    );
    await page.mouse.wheel(
      0,
      note.y + note.height - (viewport.y + viewport.height - 120),
    );
    await expect
      .poll(async () => {
        const end = await card.boundingBox();
        return Math.abs(
          (end?.y ?? 0) +
            (end?.height ?? 0) -
            (viewport.y + viewport.height - 120),
        );
      })
      .toBeLessThan(2);
    await page.screenshot({ path: `${output}/long-tail-${width}.png` });
    await page.getByRole("button", { name: "付箋全体を表示" }).click();
    expect(await board.evaluate((element) => element.scrollTop)).toBe(0);
  },
);

test("2軸マップでも長文を全体表示し、先頭の本文へ通常pointerが届く", async () => {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--interactive-idea-map-reading&viewMode=story`,
  );
  const card = page.getByTestId("note-card");
  await card.waitFor();
  await page.getByRole("button", { name: "付箋全体を表示" }).click();
  const viewport = await page.getByTestId("board-scroller").boundingBox();
  const note = await card.boundingBox();
  if (!viewport || !note) throw new Error("マップの読書領域が見つかりません");
  await page.screenshot({
    path: `${output}/${process.env.U07_CAPTURE_STAGE ?? "after"}-map-long-fit.png`,
  });
  expect(note.y).toBeGreaterThanOrEqual(viewport.y);
  expect(note.y + note.height).toBeLessThanOrEqual(
    viewport.y + viewport.height,
  );
  await page.getByRole("button", { name: "ズームを100%に戻す" }).click();
  await expect
    .poll(async () => (await card.boundingBox())?.width)
    .toBeCloseTo(200, 0);
  const expanded = await card.boundingBox();
  if (!expanded) throw new Error("マップの付箋が見つかりません");
  await page.mouse.move(
    viewport.x + viewport.width / 2,
    viewport.y + viewport.height / 2,
  );
  await page.mouse.wheel(0, expanded.y - (viewport.y + 180));
  await expect
    .poll(async () => (await card.boundingBox())?.y)
    .toBeCloseTo(viewport.y + 180, 0);
  const readable = await card.boundingBox();
  if (!readable) throw new Error("マップの付箋先頭が見つかりません");
  const point = { x: readable.x + readable.width / 2, y: readable.y + 20 };
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-note-id]")
          ?.getAttribute("data-note-id"),
      point,
    ),
  ).toBe("note-1");
  await page.mouse.click(point.x, point.y);
  expect(await card.getAttribute("data-selected")).toBe("true");
});
