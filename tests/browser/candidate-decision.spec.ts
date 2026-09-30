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
const output =
  process.env.U11_EVIDENCE_DIR ?? "test-results/candidate-decision";
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});
afterEach(async () => {
  await page.close();
});
afterAll(async () => {
  await browser.close();
});

async function story(id: string): Promise<void> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.evaluate(() => document.fonts.ready);
}

// locator の自動スクロールに頼らず、表示位置へ通常pointerが届くかを確認する。
async function pointerClick(selector: string): Promise<void> {
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw new Error("操作対象が見つかりません");
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const viewport = page.viewportSize();
  expect(point.x).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(viewport?.width ?? 0);
  expect(point.y).toBeGreaterThan(0);
  expect(point.y).toBeLessThan(viewport?.height ?? 0);
  expect(
    await page.evaluate(
      ({ x, y, selector }) =>
        Boolean(document.elementFromPoint(x, y)?.closest(selector)),
      { ...point, selector },
    ),
  ).toBe(true);
  await page.mouse.click(point.x, point.y);
}

test.each([
  1280, 390,
])("%ipx: 集計を閉じて再表示し、0票も含む比較と採用の入口を区別する", async (width) => {
  await page.setViewportSize({ width, height: 844 });
  await story("room-votetotalingdialog--interactive");
  await page.getByRole("button", { name: "投票結果を表示" }).click();
  await page.getByRole("dialog").waitFor();
  expect(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /決定/ })
      .count(),
  ).toBe(0);
  await pointerClick('[data-slot="dialog-close"]');
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "投票結果を表示" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
});

test("狭画面の採用案内とキャンセルが重ならず、本文を省略しない", async () => {
  await story("room-adoptnotecontrol--selecting-question");
  await page.getByRole("status").waitFor();
  const status = page.getByRole("status");
  expect(await status.innerText()).toContain("取り消し・再投票できません");
  const text = await status.locator("div").evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(text.scroll).toBeLessThanOrEqual(text.width);
  await pointerClick('button[aria-label="選択をキャンセル"]');
  await page.screenshot({ path: `${output}/selection-mobile.png` });
});

test.each([
  "confirming",
  "disconnected-while-confirming",
])("%s: 一括確認を狭画面で取消でき、確認中の切断では確定を止める", async (state) => {
  await story(`room-bulkcandidateexclusion--${state}`);
  await page.getByRole("alertdialog").waitFor();
  const confirm = page.getByRole("button", {
    name: "3件を候補から外す",
    exact: true,
  });
  await expect
    .poll(() => confirm.isDisabled())
    .toBe(state === "disconnected-while-confirming");
  await page.screenshot({ path: `${output}/bulk-${state}.png` });
  await pointerClick('[data-slot="alert-dialog-cancel"]');
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  const trigger = page.getByRole("button", {
    name: "投票なしをまとめて候補から外す（3件）",
  });
  if (state === "confirming") {
    expect(
      await trigger.evaluate((element) => document.activeElement === element),
    ).toBe(true);
  } else {
    // disabled の native button はフォーカスを受け取れない。
    expect(await trigger.isDisabled()).toBe(true);
  }
});
