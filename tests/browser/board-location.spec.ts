import { mkdir } from "node:fs/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  await mkdir("test-results/board-layout", { recursive: true });
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(5000);
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});
async function open(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.getByTestId("board-location-trigger").waitFor();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page
        .getByTestId("step-guide")
        .evaluate((el) => el.getAnimations().length),
    )
    .toBe(0);
  await page.evaluate(() => document.fonts.ready);
}
async function reachable(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );
  expect(
    await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      return [
        [x, y],
        [rect.left + 4, y],
        [rect.right - 4, y],
        [x, rect.top + 4],
        [x, rect.bottom - 4],
      ].every(([px, py]) =>
        element.contains(document.elementFromPoint(px, py)),
      );
    }),
  ).toBe(true);
}

test.each([
  [542, 618],
  [390, 844],
  [320, 568],
])("%i×%iでも現在地の位置と幅を保って直下に手順を開く", async (width, height) => {
  await page.setViewportSize({ width, height });
  await open("room-roomboardlayout--phase-2-step-1");
  const trigger = page.getByRole("button", { name: /現在地/ });
  const card = page.getByTestId("board-location-card");
  const before = await trigger.boundingBox();
  await trigger.click();
  expect(await trigger.boundingBox()).toEqual(before);
  const expanded = await card.boundingBox();
  expect(expanded).not.toBeNull();
  expect(expanded?.y).toBe((before?.y ?? 0) - 1);
  expect(expanded?.height).toBeGreaterThan(before?.height ?? 0);
  await page.getByRole("tab", { name: /アイデア/ }).click();
  await reachable(
    page
      .getByRole("list", { name: "このフェーズの全手順" })
      .locator("li")
      .last(),
  );
  expect(await trigger.boundingBox()).toEqual(before);
  await trigger.click();
  expect(await trigger.boundingBox()).toEqual(before);
});

test("画面を狭めても現在地は横に広がらず、開いた詳細も同じ幅を保つ", async () => {
  await open("room-roomboardlayout--phase-2-step-2");
  const card = page.getByTestId("board-location-card");
  const trigger = page.getByRole("button", { name: /現在地/ });
  let previousWidth = Number.POSITIVE_INFINITY;
  for (const width of [
    1280, 1200, 1199, 901, 900, 640, 639, 637, 542, 390, 330, 320,
  ]) {
    await page.setViewportSize({ width, height: 618 });
    const compact = await card.boundingBox();
    expect(compact).not.toBeNull();
    expect(compact?.width).toBeLessThanOrEqual(previousWidth);
    previousWidth = compact?.width ?? 0;
    await reachable(trigger);
    const before = await trigger.boundingBox();
    await trigger.click();
    expect(await trigger.boundingBox()).toEqual(before);
    expect((await card.boundingBox())?.width).toBe(previousWidth);
    await reachable(page.getByTestId("board-current-step"));
    await trigger.click();
  }
});

test.each([
  [1280, 720],
  [390, 844],
  [320, 568],
])("%i×%iで2状態・3フェーズ・長い作業名・一覧・閉じた後の操作へ到達できる", async (width, height) => {
  await page.setViewportSize({ width, height });
  await open("room-roomboardlayout--phase-3-step-3");
  const trigger = page.getByRole("button", { name: /現在地/ });
  const card = page.getByTestId("board-location-card");
  const reference = page.getByRole("button", { name: "決定した課題" });
  const guide = page.getByTestId("step-guide");
  const canvas = page.getByTestId("board-canvas");
  const boxes = await Promise.all([
    reference.boundingBox(),
    guide.boundingBox(),
    canvas.boundingBox(),
  ]);
  await reachable(trigger);
  await page.screenshot({
    path: `test-results/board-layout/location-${width}-compact.png`,
  });
  await trigger.click();
  expect(await card.getAttribute("data-state")).toBe("expanded");
  await reachable(page.getByTestId("board-current-step"));
  expect(await page.getByTestId("board-current-step").innerText()).toContain(
    "価値×実現のしやすさで評価",
  );
  expect(
    await Promise.all([
      reference.boundingBox(),
      guide.boundingBox(),
      canvas.boundingBox(),
    ]),
  ).toEqual(boxes);
  expect(
    await page
      .getByRole("tab", { name: /アイデア/ })
      .getAttribute("aria-selected"),
  ).toBe("true");
  const list = page.getByRole("list", { name: "このフェーズの全手順" });
  expect(await list.locator("li").count()).toBe(5);
  expect(await list.locator('[aria-current="step"]').innerText()).toContain(
    "価値×実現のしやすさで評価",
  );
  for (const row of await list.locator("li").all()) await reachable(row);
  for (const tab of await page
    .getByRole("tablist", { name: "3つのフェーズの手順" })
    .getByRole("tab")
    .all())
    await reachable(tab);
  await reachable(trigger);
  await page.screenshot({
    path: `test-results/board-layout/location-${width}-steps.png`,
  });
  await page.getByRole("tab", { name: /問い/ }).click();
  expect(await list.locator("li").count()).toBe(4);
  expect(await trigger.innerText()).toContain("アイデア決定・3/5");
  await trigger.click();
  await trigger.click();
  expect(
    await page
      .getByRole("tab", { name: /アイデア/ })
      .getAttribute("aria-selected"),
  ).toBe("true");
  await page.keyboard.press("Escape");
  expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
  await reachable(page.getByRole("button", { name: "進め方", exact: true }));
  await reachable(
    page.getByRole("button", { name: "次のステップへ", exact: true }),
  );
  await open("room-roomboardlayout--phase-3-step-1");
  const hint = page.getByRole("button", { name: "考えるヒントを閉じる" });
  await reachable(hint);
  const notes = page.getByRole("button", { name: "マイ付箋を閉じる" });
  await reachable(notes);
  await page.getByRole("button", { name: /現在地/ }).click();
  await page.getByRole("button", { name: /現在地/ }).click();
  await reachable(hint);
  await reachable(notes);
});

test("実際の付箋を押すと手順を畳むと同時に選択し、カメラと参照欄を保持する", async () => {
  await open("room-roomboardlayout--phase-3-step-3");
  const reference = page.getByRole("button", { name: "決定した課題" });
  await reference.click();
  const canvas = page.getByTestId("board-canvas");
  const before = await canvas.boundingBox();
  const trigger = page.getByRole("button", { name: /現在地/ });
  await trigger.click();
  const note = page.getByTestId("note-card").first();
  await note.getByRole("button", { name: "付箋", exact: true }).click();
  expect(await trigger.getAttribute("aria-expanded")).toBe("false");
  expect(await note.getAttribute("data-selected")).toBe("true");
  expect(await reference.getAttribute("aria-expanded")).toBe("true");
  expect(await canvas.boundingBox()).toEqual(before);
});

test("キーボードで3フェーズを直接閲覧し、上の入口とEscapeで閉じる", async () => {
  await open("room-roomboardlayout--phase-2-step-1");
  const trigger = page.getByRole("button", { name: /現在地/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page
        .getByRole("tab", { name: /問い/ })
        .evaluate((el) => el === document.activeElement),
    )
    .toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      page.getByRole("tab", { name: /アイデア/ }).getAttribute("aria-selected"),
    )
    .toBe("true");
  expect(
    await page.getByRole("tab", { name: /問い/ }).getAttribute("aria-current"),
  ).toBe("step");
  expect(await trigger.innerText()).toContain("問いの整理・1/4");
  await page.keyboard.press("Escape");
  expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
  await page.keyboard.press("Enter");
  expect(
    await page.getByRole("tab", { name: /問い/ }).getAttribute("aria-selected"),
  ).toBe("true");
  await page.keyboard.press("Enter");
  expect(await trigger.getAttribute("aria-expanded")).toBe("false");
});

test.each([
  [1280, 720],
  [320, 568],
])("%i×%iでフィードバックの対象・未送信入力・復帰先を保持する", async (width, height) => {
  await page.setViewportSize({ width, height });
  await open("room-roomboardview--with-feedback");
  const location = page.getByRole("button", { name: /現在地/ });
  await location.click();
  const trigger = page.getByRole("button", { name: "ルームメニューを開く" });
  await trigger.click();
  await reachable(
    page.getByRole("button", { name: "フィードバック", exact: true }),
  );
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  expect(await location.getAttribute("aria-expanded")).toBe("false");
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "フィードバック", exact: true })
        .evaluate((el) => el === document.activeElement),
    )
    .toBe(true);
  expect(await page.getByLabel("対象", { exact: true }).inputValue()).toBe(
    "1-1",
  );
  await page.getByLabel("対象", { exact: true }).selectOption("app");
  const body = page.getByRole("textbox", { name: "文章（任意）" });
  await body.fill("後で送る意見");
  await page.getByRole("button", { name: "入力欄を閉じる" }).click();
  expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
  await trigger.click();
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  expect(await page.getByLabel("対象", { exact: true }).inputValue()).toBe(
    "app",
  );
  expect(await body.inputValue()).toBe("後で送る意見");
  await page.keyboard.press("Escape");
  expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
});

// 高さが小さいときも、展開中のタブと上の閉じる入口を下部HUDが覆わない。
test("320×320でも現在地の直下の手順と上の開閉操作へ到達できる", async () => {
  await page.setViewportSize({ width: 320, height: 320 });
  await open("room-roomboardlayout--phase-3-step-3");
  const trigger = page.getByRole("button", { name: /現在地/ });
  await trigger.click();
  for (const tab of await page.getByRole("tab").all()) await reachable(tab);
  await reachable(
    page
      .getByRole("list", { name: "このフェーズの全手順" })
      .locator("li")
      .last(),
  );
  await reachable(trigger);
  await trigger.click();
});
