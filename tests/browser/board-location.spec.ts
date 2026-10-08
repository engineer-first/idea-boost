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
      return element.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    }),
  ).toBe(true);
}

test.each([
  [1280, 720],
  [390, 844],
  [320, 568],
])("%i×%iで3状態・長い作業名・一覧・閉じた後の操作へ到達できる", async (width, height) => {
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
  expect(await card.getAttribute("data-state")).toBe("overview");
  await reachable(page.getByTestId("board-current-step"));
  expect(await page.getByTestId("board-current-step").innerText()).toContain(
    "価値×実現のしやすさで評価",
  );
  if (width >= 640)
    expect(
      await Promise.all([
        reference.boundingBox(),
        guide.boundingBox(),
        canvas.boundingBox(),
      ]),
    ).toEqual(boxes);
  await reachable(page.getByRole("button", { name: "全手順を見る" }));
  await page.screenshot({
    path: `test-results/board-layout/location-${width}-overview.png`,
  });
  await page.getByRole("button", { name: "全手順を見る" }).click();
  expect(await card.getAttribute("data-state")).toBe("steps");
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
  await reachable(page.getByRole("button", { name: "概要に戻る" }));
  await reachable(page.getByRole("button", { name: "閉じる", exact: true }));
  await page.screenshot({
    path: `test-results/board-layout/location-${width}-steps.png`,
  });
  await page.getByRole("tab", { name: /問い/ }).click();
  expect(await list.locator("li").count()).toBe(4);
  expect(await trigger.innerText()).toContain("アイデア決定・3/5");
  await page.getByRole("button", { name: "概要に戻る" }).click();
  await page.getByRole("button", { name: "全手順を見る" }).click();
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
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
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
  await page.getByRole("button", { name: "全手順を見る" }).click();
  const note = page.getByTestId("note-card").first();
  await note.getByRole("button", { name: "付箋", exact: true }).click();
  expect(await trigger.getAttribute("aria-expanded")).toBe("false");
  expect(await note.getAttribute("data-selected")).toBe("true");
  expect(await reference.getAttribute("aria-expanded")).toBe("true");
  expect(await canvas.boundingBox()).toEqual(before);
});

test("キーボードだけで概要・手順・3タブ・戻る・閉じるへ到達する", async () => {
  await open("room-roomboardlayout--phase-2-step-1");
  const trigger = page.getByRole("button", { name: /現在地/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  expect(
    await page
      .getByRole("button", { name: "全手順を見る" })
      .evaluate((el) => el === document.activeElement),
  ).toBe(true);
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: "概要に戻る" });
  expect(await back.evaluate((el) => el === document.activeElement)).toBe(true);
  await page.getByRole("tab", { name: /問い/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      page.getByRole("tab", { name: /アイデア/ }).getAttribute("aria-selected"),
    )
    .toBe("true");
  await back.focus();
  await page.keyboard.press("Enter");
  expect(
    await page
      .getByRole("button", { name: "全手順を見る" })
      .evaluate((el) => el === document.activeElement),
  ).toBe(true);
  await page.getByRole("button", { name: "閉じる", exact: true }).focus();
  await page.keyboard.press("Enter");
  expect(await trigger.evaluate((el) => el === document.activeElement)).toBe(
    true,
  );
});

test.each([
  [1280, 720],
  [320, 568],
])("%i×%iでフィードバックの対象・未送信入力・復帰先を保持する", async (width, height) => {
  await page.setViewportSize({ width, height });
  await open("room-roomboardview--with-feedback");
  const trigger = page.getByRole("button", { name: /現在地/ });
  await trigger.click();
  await reachable(
    page.getByRole("button", { name: "フィードバック", exact: true }),
  );
  await page
    .getByRole("button", { name: "フィードバック", exact: true })
    .click();
  expect(await trigger.getAttribute("aria-expanded")).toBe("false");
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
