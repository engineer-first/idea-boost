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
const output = "test-results/decision-layering";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
});
afterEach(async () => {
  await page?.close();
});
afterAll(async () => {
  await browser?.close();
});

const cases = [
  { phase: "1-5", story: "adoption-after-repeated-operations" },
  { phase: "2-4", story: "hmw-adoption-after-repeated-operations" },
  { phase: "3-5", story: "map-adoption-after-repeated-operations" },
];

async function openStory(story: string) {
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardcanvas--${story}&viewMode=story`,
  );
  await page.getByTestId("board-scroller").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const { phase, story } of cases) {
  test(`${phase}: 操作履歴の大きい重なった付箋をポインターで正しく採用する`, async () => {
    await openStory(story);
    const back = page.getByRole("button", { name: /採用する.+: 奥の候補/ });
    const front = page.getByRole("button", { name: /採用する.+: 手前の候補/ });
    const box = await front.boundingBox();
    if (!box) throw new Error("採用候補の位置を取得できません");
    // 2候補が重なる中心でも、見えている手前の付箋とクリック先が一致する。
    const hitLabel = await front.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return document
        .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        ?.getAttribute("aria-label");
    });
    await page.screenshot({ path: `${output}/${phase}-before-adoption.png` });
    expect(hitLabel).toMatch(/採用する.+: 手前の候補/);
    expect(await back.count()).toBe(1);
    expect(
      await page.getByRole("button", { name: /採用する.+: 候補外/ }).count(),
    ).toBe(0);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page
      .getByRole("status")
      .filter({ hasText: "採用済み: 手前の候補" })
      .waitFor();
    expect(await page.locator("[data-adopt-target]").count()).toBe(0);
    await page.screenshot({ path: `${output}/${phase}-adopted.png` });
  });

  test(`${phase}: 採用選択中にホバーすると除外が表示され、右クリックでも除外できる`, async () => {
    await openStory(story);
    const target = page.getByRole("button", { name: /採用する.+: 手前の候補/ });
    await target.hover();
    const action = page.locator(
      '[data-candidate-action-note-id="layer-front"]',
    );
    await expect
      .poll(() =>
        action.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    await target.click({ button: "right" });
    await page.getByRole("menuitem", { name: "候補から外す" }).click();
    const front = page.locator('[data-note-id="layer-front"]');
    await expect.poll(() => front.getAttribute("data-excluded")).toBe("true");
    expect(await page.getByRole("status").innerText()).toBe("採用前");
    expect(await target.count()).toBe(0);
    // 既存の候補外付箋が同座標を覆うため、Tab相当で復帰ボタンへ進む。
    await action.focus();
    await action.click();
    await target.waitFor();
    await expect.poll(() => front.getAttribute("data-excluded")).toBeNull();
    await target.click();
    await page
      .getByRole("status")
      .filter({ hasText: "採用済み: 手前の候補" })
      .waitFor();
  });

  test(`${phase}: キーボードで除外し、採用選択を続けたまま復帰できる`, async () => {
    await openStory(story);
    const target = page.getByRole("button", { name: /採用する.+: 手前の候補/ });
    await target.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "候補から外す" }).press("Enter");
    const action = page.locator(
      '[data-candidate-action-note-id="layer-front"]',
    );
    await action.focus();
    await action.press("Enter");
    await target.waitFor();
    expect(await page.getByRole("status").innerText()).toBe("採用前");
  });

  test(`${phase}: 高い重なり順でもキーボードで候補を採用できる`, async () => {
    await openStory(story);
    await page
      .getByRole("button", { name: /採用する.+: 手前の候補/ })
      .press("Enter");
    await page
      .getByRole("status")
      .filter({ hasText: "採用済み: 手前の候補" })
      .waitFor();
    expect(await page.locator("[data-adopt-target]").count()).toBe(0);
  });

  test(`${phase}: 奥の候補の露出部分をクリックすると奥だけを採用する`, async () => {
    await openStory(story);
    const back = page.getByRole("button", { name: /採用する.+: 奥の候補/ });
    const box = await back.boundingBox();
    if (!box) throw new Error("採用候補の位置を取得できません");
    await page.mouse.click(box.x + 10, box.y + 10);
    await page
      .getByRole("status")
      .filter({ hasText: "採用済み: 奥の候補" })
      .waitFor();
  });
}
